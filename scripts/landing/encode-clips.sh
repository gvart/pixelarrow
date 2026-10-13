#!/usr/bin/env bash
# Encodes the frames recorded by scripts/landing/record-clips.mjs into the landing page's clips:
# <id>.webm (VP9), <id>.mp4 (H.264), <id>-poster.avif and <id>-poster.webp, plus an AV1 WebM for
# the hero loop (H1-av1.webm), all muted, into landing/assets-staging/video/.
#
#   bash scripts/landing/encode-clips.sh [rawDir] [outDir]
#     rawDir  default shots/landing-clips (one folder of f0000.png... + clip.env per clip)
#     outDir  default landing/assets-staging/video
#
# Needs ffmpeg with libvpx-vp9, libx264 and libsvtav1 (Homebrew's `brew install ffmpeg` has them),
# and cwebp (`brew install webp`).
#
# The loop: the take is recorded XF seconds longer than the clip; its last XF seconds are cross-faded
# into its first XF seconds, so the clip's last frame leads straight back into its first one.
# Frames are recorded at the final size with the game's integer zoom, so nothing is rescaled here (no
# bilinear blur on the pixel art, ADR-0011 §5). Byte budgets (ADR-0011): a clip's WebM <= 800 kB and
# MP4 <= 1.1 MB, the hero's WebM <= 1.2 MB and MP4 <= 1.6 MB, a poster AVIF <= 40 kB. A file over
# budget is encoded again at a higher CRF until it fits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RAW="${1:-$ROOT/shots/landing-clips}"
OUT="${2:-$ROOT/landing/assets-staging/video}"
FPS=30

for tool in ffmpeg cwebp; do
  command -v "$tool" >/dev/null || { echo "missing $tool: brew install ffmpeg webp" >&2; exit 1; }
done
mkdir -p "$OUT"

size() { wc -c <"$1" | tr -d ' '; }

# encode <dir> <kind> <crf> <budget bytes> <out file>
# Constrained quality: the CRF is the quality wanted, and a two-pass (VP9) or VBV (H.264, AV1) bitrate
# cap derived from the byte budget keeps the file under it; a file still over is redone with a cap 10%
# lower. Echoes the kbit/s cap used.
encode() {
  local dir="$1" kind="$2" crf="$3" budget="$4" out="$5" n len graph kbps
  n=$(find "$dir" -name 'f*.png' | wc -l | tr -d ' ')
  len=$(echo "$n / $FPS - $XF" | bc -l)
  graph="[0]split[a][b];[a]trim=start=$XF,setpts=PTS-STARTPTS[m];[b]trim=end=$XF,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$XF:offset=$(echo "$len - $XF" | bc -l),format=yuv420p"
  kbps=$(echo "$budget * 8 * 0.93 / $len / 1000" | bc)
  local in=(-v error -y -framerate $FPS -i "$dir/f%04d.png" -filter_complex "$graph" -an)
  while :; do
    case "$kind" in
      vp9)
        ffmpeg "${in[@]}" -c:v libvpx-vp9 -crf "$crf" -b:v "${kbps}k" -row-mt 1 -deadline good -cpu-used 1 -g 150 -pass 1 -passlogfile "$TMP/vp9" -f null /dev/null
        ffmpeg "${in[@]}" -c:v libvpx-vp9 -crf "$crf" -b:v "${kbps}k" -row-mt 1 -deadline good -cpu-used 1 -g 150 -pass 2 -passlogfile "$TMP/vp9" "$out" ;;
      av1)
        ffmpeg "${in[@]}" -c:v libsvtav1 -crf "$crf" -preset 4 -g 150 -svtav1-params "mbr=${kbps}:log-level=1" "$out" 2>/dev/null ;;
      h264)
        ffmpeg "${in[@]}" -c:v libx264 -preset slower -tune animation -crf "$crf" -maxrate "${kbps}k" -bufsize "$((kbps * 2))k" -g 150 -movflags +faststart "$out" ;;
    esac
    [ "$(size "$out")" -le "$budget" ] && break
    kbps=$((kbps * 9 / 10))
    echo "  $(basename "$out") over budget, cap ${kbps}k" >&2
  done
  echo "${kbps}k"
}
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

printf '%-4s %-10s %10s %10s %10s %10s %s\n' id size webm mp4 avif webp crf
for dir in "$RAW"/*/; do
  dir="${dir%/}"
  id="$(basename "$dir")"
  [ -f "$dir/clip.env" ] || continue
  # W H: frame size; XF: loop cross-fade (s); POSTER: poster time in the take (s)
  W='' H='' XF=0.5 POSTER=1
  # shellcheck disable=SC1091
  source "$dir/clip.env"
  if [ "$id" = H1 ]; then wb=1200000; mb=1600000; else wb=800000; mb=1100000; fi
  c1=$(encode "$dir" vp9 30 "$wb" "$OUT/$id.webm")
  c2=$(encode "$dir" h264 22 "$mb" "$OUT/$id.mp4")
  [ "$id" = H1 ] && encode "$dir" av1 32 "$wb" "$OUT/$id-av1.webm" >/dev/null
  # poster: the named frame of the take, as is (lossless source), then AVIF and WebP
  pf="$dir/f$(printf %04d "$(echo "($POSTER * $FPS + 0.5) / 1" | bc)").png"
  q=30
  while :; do
    ffmpeg -v error -y -i "$pf" -frames:v 1 -c:v libsvtav1 -crf "$q" -pix_fmt yuv420p -svtav1-params log-level=1 "$OUT/$id-poster.avif" 2>/dev/null
    [ "$(size "$OUT/$id-poster.avif")" -le 40000 ] && break
    q=$((q + 4))
  done
  cwebp -quiet -q 80 -m 6 "$pf" -o "$OUT/$id-poster.webp"
  printf '%-4s %-10s %10s %10s %10s %10s %s\n' "$id" "${W}x${H}" "$(size "$OUT/$id.webm")" "$(size "$OUT/$id.mp4")" "$(size "$OUT/$id-poster.avif")" "$(size "$OUT/$id-poster.webp")" "vp9 $c1 / h264 $c2 / avif $q"
done
