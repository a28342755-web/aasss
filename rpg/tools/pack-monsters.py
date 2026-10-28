#!/usr/bin/env python3
"""assets/monsters/*.webp → js/data-monsters.js (FATES.MON_ART = {도감 번호: data URI}).

몬스터 그림은 몬스터 도감 시트(96종)에서 오려 배경을 지운 것이다. 번호는 시트의 도감 번호(01~96)이고,
이름·성질은 js/monart.js의 ART, 세기·등장 층은 js/data-world.js의 MONSTERS에 적는다.
그림을 바꾸거나 더하면 다시 실행한다: python3 rpg/tools/pack-monsters.py
"""
import base64, json, os

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = os.path.join(root, "assets", "monsters")
art = {}
for f in sorted(os.listdir(src)):
    if f.endswith(".webp"):
        art[f[:-5]] = "data:image/webp;base64," + base64.b64encode(open(os.path.join(src, f), "rb").read()).decode()
out = os.path.normpath(os.path.join(root, "js", "data-monsters.js"))
with open(out, "w", encoding="utf-8") as fp:
    fp.write("/* 삼천의 운명 — 몬스터 그림 데이터. tools/pack-monsters.py가 assets/monsters/*.webp로 만든다. 직접 고치지 말 것 */\n")
    fp.write("(function (root) {\n  (root.FATES = root.FATES || {}).MON_ART = ")
    fp.write(json.dumps(art, indent=0).replace("\n", "\n  "))
    fp.write(";\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
print(out, os.path.getsize(out), "bytes,", len(art), "monsters")
