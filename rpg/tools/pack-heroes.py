#!/usr/bin/env python3
"""assets/heroes/*.webp, assets/fx/*.png → js/data-heroes.js (FATES.HERO_ART, FATES.FX_ART = {이름: data URI}).

캐릭터 그림을 스크립트 안에 넣어 두면 index.html을 파일로 바로 열어도(file://) 캔버스가 그림의 픽셀을
읽을 수 있다. 직업마다 옷 색을 바꾸는 heroart.js와 기술 그림을 속성 색으로 물들이는 spells.js가 픽셀을 읽어야 해서 필요하다.
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
fxdir = os.path.join(root, "assets", "fx")
fx = {}
for f in sorted(os.listdir(fxdir)):
    if f.endswith(".png"):
        fx[f[:-4]] = "data:image/png;base64," + base64.b64encode(open(os.path.join(fxdir, f), "rb").read()).decode()
out = os.path.normpath(os.path.join(root, "js", "data-heroes.js"))
with open(out, "w", encoding="utf-8") as fp:
    fp.write("/* 삼천의 운명 — 캐릭터 그림 데이터. tools/pack-heroes.py가 assets/heroes/*.webp로 만든다. 직접 고치지 말 것 */\n")
    fp.write("(function (root) {\n  (root.FATES = root.FATES || {}).HERO_ART = ")
    fp.write(json.dumps(art, indent=0).replace("\n", "\n  "))
    fp.write(";\n  root.FATES.FX_ART = ")
    fp.write(json.dumps(fx, indent=0).replace("\n", "\n  "))
    fp.write(";\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
print(out, os.path.getsize(out), "bytes,", len(art), "heroes,", len(fx), "effects")
