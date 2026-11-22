"""Cut a job's idle sheet (8 frames of 256 px on a dark background) into a transparent in-game sprite sheet:
dark background connected to the frame border becomes transparent, specks under 60 px and 1-3 px lines are dropped,
every frame is cropped to the union box (feet on the bottom row) and halved to 128-px scale.
Usage: python cutout.py <idle sheets dir> <out dir> id[,id...]"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

def cut(frame):
    a = np.array(frame.convert('RGB')).astype(int)
    dark = a.max(-1) < 46
    lab, n = ndimage.label(dark)
    edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    alpha = ~np.isin(lab, list(edge))
    lab2, n2 = ndimage.label(alpha)
    if n2:
        sizes = ndimage.sum(alpha, lab2, range(1, n2 + 1)); boxes = ndimage.find_objects(lab2)
        keep = [i + 1 for i, (s, bx) in enumerate(zip(sizes, boxes)) if s >= 60 and min(bx[0].stop - bx[0].start, bx[1].stop - bx[1].start) > 3]  # drops specks and the thin border lines the generator sometimes leaves
        alpha &= np.isin(lab2, keep)
    return np.dstack([a, alpha * 255]).astype('uint8'), alpha

if __name__ == '__main__':
    src, dst, ids = sys.argv[1], sys.argv[2], sys.argv[3].split(','); os.makedirs(dst, exist_ok=True)
    for jid in ids:
        sheet = Image.open(os.path.join(src, f'{jid}_idle.png')).convert('RGB'); n = sheet.width // sheet.height; s = sheet.height
        cuts = [cut(sheet.crop((i * s, 0, i * s + s, s))) for i in range(n)]
        m = np.any([c[1] for c in cuts], 0); ys, xs = np.where(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        fw, fh = (x1 - x0) // 2, (y1 - y0) // 2
        out = Image.new('RGBA', (fw * n, fh))
        for i, (rgba, _) in enumerate(cuts): out.paste(Image.fromarray(rgba[y0:y1, x0:x1]).resize((fw, fh), Image.NEAREST), (i * fw, 0))
        assert out.getbbox(), jid
        out.save(os.path.join(dst, f'{jid}.png'), optimize=True)
        print(jid, fw, fh, os.path.getsize(os.path.join(dst, f'{jid}.png')))
