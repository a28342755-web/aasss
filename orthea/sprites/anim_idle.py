"""Idle loop from one job illustration (no re-generation, so every frame stays the same drawing):
upper-body breathing, glow pulse and twinkling sparkles. Writes <id>_idle.png: 8 frames side by side at 256 px, 256-colour palette.
Usage: python anim_idle.py <illustrations dir> <out dir> <jobs.json>"""
import hashlib, json, math, os, sys
import numpy as np
from PIL import Image

FRAMES, MS = 8, 120

def frames_for(img, glow_hex, seed):
    a = np.array(img.convert('RGB')).astype(float); h, w, _ = a.shape
    lum = a.mean(-1); dark = lum < 40
    rows = np.where((~dark).sum(1) > w * .04)[0]; top, bot = (rows[0], rows[-1]) if len(rows) else (0, h - 1)
    waist = int(top + (bot - top) * .58)
    mx, mn = a.max(-1), a.min(-1); glowing = (mx > 170) & ((mx - mn) > 70)  # saturated bright pixels: gems, magic, sparkles
    rng = np.random.default_rng(seed)
    cand = np.argwhere(dark[16:-16, 16:-16]) + 16; pts = cand[rng.choice(len(cand), 7, replace=False)] if len(cand) > 7 else cand
    g = np.array([int(glow_hex[i:i + 2], 16) for i in (1, 3, 5)], float); g = g + (255 - g) * .45
    out = []
    for f in range(FRAMES):
        ph = 2 * math.pi * f / FRAMES; s = 1 + .014 * math.sin(ph)
        b = a.copy()
        ys = np.arange(waist); src = np.clip(np.round(waist - (waist - ys) / s).astype(int), 0, h - 1)  # stretch rows above the waist
        b[:waist] = a[src]
        gm = glowing[np.r_[src, np.arange(waist, h)]]
        b[gm] = np.clip(b[gm] * (1 + .18 * math.sin(ph * 2)), 0, 255)
        for k, (y, x) in enumerate(pts):
            t = (math.sin(ph + k * 1.7) + 1) / 2
            if t < .35: continue
            r = int(1 + t * 4)
            b[y, max(0, x - r):x + r + 1] = g; b[max(0, y - r):y + r + 1, x] = g; b[y, x] = 255
        out.append(Image.fromarray(b.astype('uint8')))
    return out

if __name__ == '__main__':
    src, dst, jobs = sys.argv[1:4]; os.makedirs(dst, exist_ok=True)
    glow = {j['id']: j['glow'] for j in json.load(open(jobs))}
    for fn in sorted(os.listdir(src)):
        if not fn.endswith('.png'): continue
        jid = fn[:-4]; fr = frames_for(Image.open(os.path.join(src, fn)), glow.get(jid, '#9fc4ff'), int(hashlib.md5(jid.encode()).hexdigest()[:8], 16))
        fr = [im.resize((256, 256), Image.BOX) for im in fr]
        sheet = Image.new('RGB', (256 * FRAMES, 256)); [sheet.paste(im, (i * 256, 0)) for i, im in enumerate(fr)]
        sheet.quantize(256, method=Image.Quantize.MEDIANCUT).save(os.path.join(dst, jid + '_idle.png'), optimize=True)
        print(jid, flush=True)
