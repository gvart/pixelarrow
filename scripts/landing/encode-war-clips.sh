#!/usr/bin/env bash
# Encodes the frames recorded by scripts/landing/record-war-clips.mjs into the landing page's war clips:
# war-<id>.webm (VP9) and war-<id>.mp4 (H.264) at 1280x720, war-<id>-hd.webm / -hd.mp4 at 1920x1080,
# war-<id>-poster.webp and -poster.avif (a frame of the 720p take), into landing/public/video/.
# A shot recorded with audio (audio.wav, AUDIO=1 in clip.env) gets Opus / AAC; the rest are muted.
#
#   bash scripts/landing/encode-war-clips.sh [rawDir] [outDir]
#     rawDir  default shots/war-clips (<W>x<H>/<id>/f0000.png... + clip.env)
#     outDir  default landing/public/video
#
# Needs ffmpeg with libvpx-vp9, libx264 and libsvtav1, and cwebp (brew install ffmpeg webp).
# The loop: the clip's last XF seconds are cross-faded into its first XF seconds (XF=0: no loop fade).
# Byte budgets keep the set small (six clips in both sizes ~14 MB): a file over budget is encoded again with a
# bitrate cap 10% lower until it fits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RAW="${1:-$ROOT/shots/war-clips}"
OUT="${2:-$ROOT/landing/public/video}"

for tool in ffmpeg cwebp; do
  command -v "$tool" >/dev/null || { echo "missing $tool: brew install ffmpeg webp" >&2; exit 1; }
done
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

size() { wc -c <"$1" | tr -d ' '; }

# encode <dir> <vp9|h264> <crf> <budget bytes> <out file>
encode() {
  local dir="$1" kind="$2" crf="$3" budget="$4" out="$5" n len graph kbps
  n=$(find "$dir" -name 'f*.png' | wc -l | tr -d ' ')
  len=$(echo "$n / $FPS - $XF" | bc -l)
  if [ "$XF" != 0 ]; then
    graph="[0]split[a][b];[a]trim=start=$XF,setpts=PTS-STARTPTS[m];[b]trim=end=$XF,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$XF:offset=$(echo "$len - $XF" | bc -l),format=yuv420p[v]"
  else
    graph="[0]format=yuv420p[v]"
  fi
  kbps=$(echo "$budget * 8 * 0.93 / $len / 1000" | bc)
  local in=(-v error -y -framerate "$FPS" -i "$dir/f%04d.png")
  local map=(-filter_complex "$graph" -map '[v]')
  if [ "$AUDIO" = 1 ]; then
    in+=(-i "$dir/audio.wav")
    map+=(-map 1:a -t "$len")
    [ "$kind" = vp9 ] && map+=(-c:a libopus -b:a 96k) || map+=(-c:a aac -b:a 128k)
  else
    map+=(-an)
  fi
  while :; do
    case "$kind" in
      vp9)
        ffmpeg "${in[@]}" -filter_complex "$graph" -map '[v]' -an -c:v libvpx-vp9 -crf "$crf" -b:v "${kbps}k" -row-mt 1 -deadline good -cpu-used 2 -g 150 -pass 1 -passlogfile "$TMP/vp9" -f null /dev/null
        ffmpeg "${in[@]}" "${map[@]}" -c:v libvpx-vp9 -crf "$crf" -b:v "${kbps}k" -row-mt 1 -deadline good -cpu-used 2 -g 150 -pass 2 -passlogfile "$TMP/vp9" "$out" ;;
      h264)
        ffmpeg "${in[@]}" "${map[@]}" -c:v libx264 -preset slower -tune animation -crf "$crf" -maxrate "${kbps}k" -bufsize "$((kbps * 2))k" -g 150 -movflags +faststart "$out" ;;
    esac
    [ "$(size "$out")" -le "$budget" ] && break
    kbps=$((kbps * 9 / 10))
    echo "  $(basename "$out") over budget, cap ${kbps}k" >&2
  done
}

printf '%-10s %-10s %10s %10s %s\n' id size webm mp4 poster
for dir in "$RAW"/*x*/*/; do
  dir="${dir%/}"
  id="$(basename "$dir")"
  [ -f "$dir/clip.env" ] || continue
  W='' H='' FPS=30 XF=0 POSTER=1 AUDIO=0
  # shellcheck disable=SC1091
  source "$dir/clip.env"
  if [ "$H" -ge 1080 ]; then stem="war-$id-hd"; wb=700000; mb=850000; else stem="war-$id"; wb=350000; mb=450000; fi
  encode "$dir" vp9 34 "$wb" "$OUT/$stem.webm"
  encode "$dir" h264 24 "$mb" "$OUT/$stem.mp4"
  poster=-
  if [ "$H" -lt 1080 ]; then
    pf="$dir/f$(printf %04d "$(echo "($POSTER * $FPS + 0.5) / 1" | bc)").png"
    cwebp -quiet -q 80 -m 6 "$pf" -o "$OUT/war-$id-poster.webp"
    q=30
    while :; do
      ffmpeg -v error -y -i "$pf" -frames:v 1 -c:v libsvtav1 -crf "$q" -pix_fmt yuv420p -svtav1-params log-level=1 "$OUT/war-$id-poster.avif" 2>/dev/null
      [ "$(size "$OUT/war-$id-poster.avif")" -le 60000 ] && break
      q=$((q + 4))
    done
    poster="$(size "$OUT/war-$id-poster.webp")"
  fi
  printf '%-10s %-10s %10s %10s %s\n' "$id" "${W}x${H}" "$(size "$OUT/$stem.webm")" "$(size "$OUT/$stem.mp4")" "$poster"
done
