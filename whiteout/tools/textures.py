# Builds assets/tex/*.jpg from CC0 scans (Poly Haven, ambientCG). Run once: python3 whiteout/tools/textures.py [cache dir]
# Surfaces are copied as colour (AO baked in), OpenGL normal and roughness; "grey" sets lose their hue so the game can
# tint one scan per use (paint colours, gun finishes). The ground is composited: smooth and trampled snow mixed by a
# large-scale mask, with patches of wet roofing tar showing through.
import json, os, sys, tempfile, urllib.request, zipfile
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'polyhaven')
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)

get = lambda url: urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'whiteout-texture-build'}))  # the APIs refuse urllib's default agent
load = lambda f: np.asarray(Image.open(f).convert('RGB'), dtype=np.float32) / 255
def fetch(asset, kind):  # Poly Haven: one 1k JPG per map; None if the asset has no such map
    path = os.path.join(CACHE, f'{asset}_{kind}.jpg')
    if not os.path.exists(path):
        files = json.load(get(f'https://api.polyhaven.com/files/{asset}'))
        if kind not in files: return None
        with get(files[kind]['1k']['jpg']['url']) as r, open(path, 'wb') as f: f.write(r.read())
    return load(path)
def acg(asset, kind):  # ambientCG: a zip of 1K JPG maps per material
    path = os.path.join(CACHE, f'{asset}_1K-JPG.zip')
    if not os.path.exists(path):
        with get(f'https://ambientcg.com/get?file={asset}_1K-JPG.zip') as r, open(path, 'wb') as f: f.write(r.read())
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.endswith(f'_{kind}.jpg')]
        return load(z.open(names[0])) if names else None

def save(a, name, q):
    a = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(a if a.ndim == 3 else a, 'RGB' if a.ndim == 3 else 'L').save(os.path.join(OUT, name), quality=q, optimize=True)

KINDS = {fetch: ('Diffuse', 'nor_gl', 'Rough', 'AO'), acg: ('Color', 'NormalGL', 'Roughness', 'AmbientOcclusion')}
for src, asset, name, grey in [(fetch, 'whitewashed_brick', 'brick', 0), (fetch, 'castle_brick_02_white', 'redbrick', 0),
                               (fetch, 'plastered_wall', 'stone', 0), (fetch, 'concrete_floor_worn_001', 'concrete', 0), (fetch, 'raw_plank_wall', 'wood', 0),
                               (acg, 'Metal055A', 'paint', 1), (acg, 'Metal027', 'gunmetal', 1), (acg, 'Metal028', 'steel', 1), (acg, 'Plastic012A', 'polymer', 1)]:
    col, nrm, rgh, ao = (src(asset, k) for k in KINDS[src])
    if ao is not None: col = col * (0.35 + 0.65 * ao)
    if grey: col = (col @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None].repeat(3, 2); col *= 0.8 / col.mean()
    save(col, f'{name}_col.jpg', 84); save(nrm, f'{name}_nrm.jpg', 88); save(rgh[..., 0], f'{name}_rgh.jpg', 84)

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
