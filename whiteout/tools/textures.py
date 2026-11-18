# Builds assets/tex/*.jpg from Poly Haven scans (CC0). Run once: python3 whiteout/tools/textures.py
# Bricks are copied as-is (colour with AO baked in, OpenGL normal, roughness). The ground is composited:
# smooth and trampled snow mixed by a large-scale mask, with patches of wet roofing tar showing through.
import json, os, sys, tempfile, urllib.request
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'polyhaven')
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)

get = lambda url: urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'whiteout-texture-build'}))  # the API refuses urllib's default agent
def fetch(asset, kind):
    path = os.path.join(CACHE, f'{asset}_{kind}.jpg')
    if not os.path.exists(path):
        files = json.load(get(f'https://api.polyhaven.com/files/{asset}'))
        with get(files[kind]['1k']['jpg']['url']) as r, open(path, 'wb') as f: f.write(r.read())
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255

def save(a, name, q):
    a = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(a if a.ndim == 3 else a, 'RGB' if a.ndim == 3 else 'L').save(os.path.join(OUT, name), quality=q, optimize=True)

for asset, name in [('whitewashed_brick', 'brick'), ('castle_brick_02_white', 'redbrick')]:
    col, ao = fetch(asset, 'Diffuse'), fetch(asset, 'AO')
    save(col * (0.35 + 0.65 * ao), f'{name}_col.jpg', 84)
    save(fetch(asset, 'nor_gl'), f'{name}_nrm.jpg', 88)
    save(fetch(asset, 'Rough')[..., 0], f'{name}_rgh.jpg', 84)

# ---- ground: 8 m tile at 2048 px; each 2 m snow scan is tiled 4x4
S, rng = 2048, np.random.default_rng(7)
def tile(a): return np.tile(np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((S // 4, S // 4), Image.LANCZOS), np.float32) / 255, (4, 4, 1))
def field(scale, octaves=4):  # periodic fBm from a filtered random spectrum, so the mask tiles too
    f = np.fft.fftfreq(S)[:, None] ** 2 + np.fft.fftfreq(S)[None, :] ** 2
    out = np.zeros((S, S), np.float32)
    for o in range(octaves):
        spec = np.fft.fft2(rng.standard_normal((S, S))) * np.exp(-f * (S / (scale * 2 ** o)) ** 2)
        n = np.real(np.fft.ifft2(spec)); out += (n / n.std()) / 2 ** o
    return out / out.std()
smooth = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))

s1 = [tile(fetch('snow_01', k)) for k in ('Diffuse', 'nor_gl', 'Rough')]  # trampled, boot prints
s2 = [tile(fetch('snow_02', k)) for k in ('Diffuse', 'nor_gl', 'Rough')]  # smooth packed
m = smooth(-0.4, 0.6, field(3))[..., None]
wet = field(6) + 0.3 * field(40)
tar = smooth(1.9, 2.3, wet)[..., None]
slush = (smooth(1.3, 2.0, wet)[..., None] - tar).clip(0, 1)
col = s2[0] * (1 - m) + s1[0] * m
nrm = s2[1] * (1 - m) + s1[1] * m
rgh = s2[2] * (1 - m) + s1[2] * m
grit = 0.5 + 0.5 * smooth(-2, 2, field(300, 2))[..., None]
col = col * (1 - slush * 0.45) + slush * 0.45 * np.array([0.5, 0.49, 0.48])
col = col * (1 - tar) + tar * np.array([0.27, 0.27, 0.28]) * (0.8 + 0.4 * grit)
nrm = nrm * (1 - tar * 0.85) + tar * 0.85 * np.array([0.5, 0.5, 1.0])
n = nrm * 2 - 1; nrm = n / np.linalg.norm(n, axis=2, keepdims=True) * 0.5 + 0.5
rgh = rgh * (1 - tar) + tar * (0.22 + 0.2 * grit)
save(col, 'ground_col.jpg', 84); save(nrm, 'ground_nrm.jpg', 88); save(rgh[..., 0], 'ground_rgh.jpg', 84)
print('wrote', sorted(os.listdir(OUT)))
