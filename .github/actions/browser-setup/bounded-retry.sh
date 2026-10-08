#!/usr/bin/env bash
# Usage: bounded-retry.sh <total-seconds> <attempt-seconds> <command...>
#
# Runs <command> up to 3 times. Each attempt is bounded by <attempt-seconds>
# (and by what is left of <total-seconds>), so a hung apt mirror or dpkg lock
# still fails the job well before its timeout-minutes.
#
# Why not plain `timeout N cmd`: `playwright install-deps` runs
# `sudo apt-get ...`, and sudo (use_pty) starts apt-get in its own session as
# root. `timeout` only signals its own process group, so on a timed-out
# attempt apt-get kept downloading and held /var/lib/dpkg/lock-frontend, and
# every retry failed at once with "Could not get lock". So here a timed-out
# attempt kills its whole process group as root, then any apt-get it left
# behind, waits for the apt/dpkg locks to be free and repairs an interrupted
# dpkg run before the next attempt.
set -uo pipefail

total=$1 per_attempt=$2
shift 2

# shellcheck disable=SC2206 # tests override the lock list
LOCKS=(${BOUNDED_RETRY_LOCKS:-/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock})
SUDO=${BOUNDED_RETRY_SUDO-sudo} # tests override this

locks_busy() {
  if command -v fuser > /dev/null; then
    $SUDO fuser "${LOCKS[@]}" > /dev/null 2>&1
  else
    pgrep -x 'apt-get|apt|dpkg|unattended-upgr' > /dev/null
  fi
}

# Wait (bounded) for apt/dpkg to be free; kill what is left after the wait.
release_apt() {
  $SUDO pkill -TERM -x apt-get > /dev/null 2>&1
  local end=$((SECONDS + 60))
  while locks_busy && ((SECONDS < end)); do sleep 2; done
  if locks_busy; then
    echo "::warning::apt/dpkg locks still held after 60s; killing apt-get and dpkg"
    $SUDO pkill -KILL -x apt-get > /dev/null 2>&1
    $SUDO pkill -KILL -x dpkg > /dev/null 2>&1
    sleep 2
  fi
  # finish whatever package configuration an interrupted dpkg left half done
  $SUDO dpkg --configure -a > /dev/null 2>&1 || true
}

# Run "$@" in its own session; past $1 seconds kill that whole group.
run_bounded() {
  local secs=$1
  shift
  # Background jobs of a non-interactive shell are not group leaders, so
  # setsid execs in place: $! is the pid, process group and session id.
  setsid "$@" &
  local pid=$!
  # shellcheck disable=SC2016 # expanded by the watchdog shell
  setsid bash -c '
    sleep "$1"
    echo "::warning::attempt exceeded $1s, killing process group $2"
    $3 kill -TERM -- "-$2" 2> /dev/null
    sleep 15
    $3 kill -KILL -- "-$2" 2> /dev/null
  ' _ "$secs" "$pid" "$SUDO" &
  local dog=$!
  wait "$pid"
  local rc=$?
  kill -- "-$dog" 2> /dev/null
  wait "$dog" 2> /dev/null
  return "$rc"
}

deadline=$((SECONDS + total))
for i in 1 2 3; do
  left=$((deadline - SECONDS))
  if ((left < 30)); then
    echo "::error::out of time budget (${total}s) after $((i - 1)) attempts"
    exit 1
  fi
  bound=$((left < per_attempt ? left : per_attempt))
  echo "attempt $i (bound ${bound}s)"
  run_bounded "$bound" "$@" && exit 0
  echo "attempt $i failed"
  release_apt
  sleep 5
done
exit 1
