#!/bin/bash
# Full song: concat rendered chunks, mux the mastered audio, then cut the delivery encodes.
set -e
cd "$(dirname "$0")"
(cd out/full && ls chunk_*.mp4 | sort | sed "s/^/file '/; s/\$/'/" > list.txt)
ffmpeg -y -loglevel error -f concat -safe 0 -i out/full/list.txt -i data/master_full.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest out/pdoom_full_master.mp4
enc() { # enc <out> <scale> <fps> <vbitrate> <maxrate> <abitrate>
  local vf="scale=$2:flags=lanczos,fps=$3"
  ffmpeg -y -loglevel error -i out/pdoom_full_master.mp4 -vf "$vf" -c:v libx264 -preset slow -b:v $4 -maxrate $5 -bufsize $5 \
    -pix_fmt yuv420p -profile:v high -pass 1 -passlogfile out/x264_$$ -an -f mp4 /dev/null
  ffmpeg -y -loglevel error -i out/pdoom_full_master.mp4 -vf "$vf" -c:v libx264 -preset slow -b:v $4 -maxrate $5 -bufsize $5 \
    -pix_fmt yuv420p -profile:v high -pass 2 -passlogfile out/x264_$$ -c:a aac -b:a $6 -movflags +faststart "$1"
}
enc out/pdoom_motion_full_hq.mp4  1920:1080 60 16M  24M 320k   # high quality
enc out/pdoom_motion_full.mp4     1920:1080 60 4.5M 7M  256k   # < 100 MB (fits a normal git push)
enc out/pdoom_motion_full_preview.mp4 1280:720 30 1.3M 2M 128k # < 30 MB preview
ls -la out/*.mp4
