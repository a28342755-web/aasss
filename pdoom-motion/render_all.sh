#!/bin/bash
# 20 s chorus cut: 3 parallel workers -> chunks -> concat -> mux mastered audio (data/master.wav from tools/master.py).
set -e
SUB=${SUB:-4}; OUT=${OUT:-out/pdoom_motion.mp4}; MASTER=out/pdoom_master_crf12.mp4
mkdir -p out
rm -f out/chunk_*.mp4
node render.mjs --cut=chorus --from=0 --to=6.6667 --sub=$SUB --out=out/chunk_0.mp4 > out/w0.log 2>&1 &
node render.mjs --cut=chorus --from=6.6667 --to=13.3333 --sub=$SUB --out=out/chunk_1.mp4 > out/w1.log 2>&1 &
node render.mjs --cut=chorus --from=13.3333 --to=20 --sub=$SUB --out=out/chunk_2.mp4 > out/w2.log 2>&1 &
wait
printf "file 'chunk_0.mp4'\nfile 'chunk_1.mp4'\nfile 'chunk_2.mp4'\n" > out/chunks.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i out/chunks.txt -i data/master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest "$MASTER"
# delivery encode: 2-pass H.264 High @ ~30 Mbps (film grain survives, file stays < 100 MB)
ffmpeg -y -loglevel error -i "$MASTER" -c:v libx264 -preset slow -b:v 30M -maxrate 45M -bufsize 60M -pix_fmt yuv420p -profile:v high -level 4.2 -pass 1 -passlogfile out/x264 -an -f mp4 /dev/null
ffmpeg -y -loglevel error -i "$MASTER" -c:v libx264 -preset slow -b:v 30M -maxrate 45M -bufsize 60M -pix_fmt yuv420p -profile:v high -level 4.2 -pass 2 -passlogfile out/x264 -c:a copy -movflags +faststart "$OUT"
echo "FINISHED $OUT"
