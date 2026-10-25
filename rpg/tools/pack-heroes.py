#!/usr/bin/env python3
"""assets/heroes/*.webp → js/data-heroes.js (FATES.HERO_ART = {그림 id: data URI}).

캐릭터 그림을 스크립트 안에 넣어 두면 index.html을 파일로 바로 열어도(file://) 캔버스가 그림의 픽셀을
읽을 수 있다. 직업마다 옷 색을 바꾸는 heroart.js가 픽셀을 읽어야 해서 필요하다.
그림을 바꾸거나 더하면 다시 실행한다: python3 rpg/tools/pack-heroes.py
"""
import base64, json, os

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = os.path.join(root, "assets", "heroes")
art = {}
for f in sorted(os.listdir(src)):
    if f.endswith(".webp"):
        data = base64.b64encode(open(os.path.join(src, f), "rb").read()).decode()
        art[f[:-5]] = "data:image/webp;base64," + data
out = os.path.normpath(os.path.join(root, "js", "data-heroes.js"))
with open(out, "w", encoding="utf-8") as fp:
    fp.write("/* 삼천의 운명 — 캐릭터 그림 데이터. tools/pack-heroes.py가 assets/heroes/*.webp로 만든다. 직접 고치지 말 것 */\n")
    fp.write("(function (root) {\n  (root.FATES = root.FATES || {}).HERO_ART = ")
    fp.write(json.dumps(art, indent=0).replace("\n", "\n  "))
    fp.write(";\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
print(out, os.path.getsize(out), "bytes,", len(art), "images")
