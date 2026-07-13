#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg is required to remaster the chord audio." >&2
    exit 1
fi

# Yellow and black share C4 and F4. Keep their permanent note definitions
# unchanged while making the one distinguishing voice survive tablet speakers:
# yellow's A4 is foregrounded and black's A3 is foregrounded.
ffmpeg -v error \
    -i "$ROOT_DIR/static/notes/piano/c4_medium.mp3" \
    -i "$ROOT_DIR/static/notes/piano/f4_medium.mp3" \
    -i "$ROOT_DIR/static/notes/piano/a4_medium.mp3" \
    -filter_complex \
    '[0:a]volume=0.7[c];[1:a]volume=0.7[f];[2:a]volume=1.2[a];[c][f][a]amix=inputs=3:duration=longest:normalize=1,loudnorm=I=-18:TP=-1.5:LRA=7[out]' \
    -map '[out]' -ar 44100 -ac 2 -c:a libmp3lame -q:a 2 \
    "$TMP_DIR/piano-yellow.mp3"

ffmpeg -v error \
    -i "$ROOT_DIR/static/notes/piano/a3_medium.mp3" \
    -i "$ROOT_DIR/static/notes/piano/c4_medium.mp3" \
    -i "$ROOT_DIR/static/notes/piano/f4_medium.mp3" \
    -filter_complex \
    '[0:a]volume=1.4[a];[1:a]volume=0.7[c];[2:a]volume=0.7[f];[a][c][f]amix=inputs=3:duration=longest:normalize=1,loudnorm=I=-18:TP=-1.5:LRA=7[out]' \
    -map '[out]' -ar 44100 -ac 2 -c:a libmp3lame -q:a 2 \
    "$TMP_DIR/piano-black.mp3"

ffmpeg -v error \
    -i "$ROOT_DIR/static/notes/guitar/c4_medium.mp3" \
    -i "$ROOT_DIR/static/notes/guitar/f4_medium.mp3" \
    -i "$ROOT_DIR/static/notes/guitar/a4_medium.mp3" \
    -filter_complex \
    '[0:a]volume=0.7[c];[1:a]volume=0.7[f];[2:a]volume=1.2[a];[c][f][a]amix=inputs=3:duration=longest:normalize=1,loudnorm=I=-18:TP=-1.5:LRA=7[out]' \
    -map '[out]' -ar 44100 -ac 2 -c:a libmp3lame -q:a 2 \
    "$TMP_DIR/guitar-yellow.mp3"

ffmpeg -v error \
    -i "$ROOT_DIR/static/notes/guitar/a3_medium.mp3" \
    -i "$ROOT_DIR/static/notes/guitar/c4_medium.mp3" \
    -i "$ROOT_DIR/static/notes/guitar/f4_medium.mp3" \
    -filter_complex \
    '[0:a]volume=2.2,bass=g=6:f=250[a];[1:a]volume=0.6[c];[2:a]volume=0.6[f];[a][c][f]amix=inputs=3:duration=longest:normalize=1,loudnorm=I=-18:TP=-1.5:LRA=7[out]' \
    -map '[out]' -ar 44100 -ac 2 -c:a libmp3lame -q:a 2 \
    "$TMP_DIR/guitar-black.mp3"

mv "$TMP_DIR/piano-yellow.mp3" "$ROOT_DIR/static/chords/piano/cfa_yellow_medium.mp3"
mv "$TMP_DIR/piano-black.mp3" "$ROOT_DIR/static/chords/piano/acf_black_medium.mp3"
mv "$TMP_DIR/guitar-yellow.mp3" "$ROOT_DIR/static/chords/guitar/c4f4a4_yellow.mp3"
mv "$TMP_DIR/guitar-black.mp3" "$ROOT_DIR/static/chords/guitar/a3c4f4_black.mp3"

echo "Remastered yellow and black chord contrast without changing their notes."
