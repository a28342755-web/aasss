#!/bin/bash
# usage: sheet.sh out.png  (tiles all out/still_*.png sorted by time, 3 columns)
cd out; files=$(ls still_*.png | sort -t_ -k2 -g); n=$(echo "$files" | wc -l)
in=$(for f in $files; do printf -- "-i %s " $f; done)
fc=$(for i in $(seq 0 $((n-1))); do printf "[$i:v]scale=640:360,drawtext=text='%s':x=8:y=8:fontsize=22:fontcolor=yellow[v$i];" "$(echo $files | cut -d' ' -f$((i+1)) | sed 's/still_//;s/.png//')"; done)
lay=$(python3 -c "print('|'.join(f'{(i%3)*640}_{(i//3)*360}' for i in range($n)))")
ffmpeg -y -loglevel error $in -filter_complex "${fc}$(for i in $(seq 0 $((n-1))); do printf "[v$i]"; done)xstack=inputs=$n:layout=$lay:fill=gray" -frames:v 1 ../$1
