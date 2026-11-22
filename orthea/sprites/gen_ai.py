"""Orthea job illustrations in the reference style, free and local: SD-Turbo img2img on CPU,
starting from the reference image (staff erased) and steering outfit, headgear and weapon per job.
Usage: python gen_ai.py <reference.jpg> <jobs.json> <out dir> [id,id,...]"""
import colorsys, hashlib, json, os, sys, time
import numpy as np, torch
from diffusers import AutoPipelineForImage2Image
from PIL import Image

HAT = {'none': 'no hat', 'wizard': 'pointed wizard hat with gold band', 'hood': 'hood', 'veil': 'white veil hood',
       'helm': 'open-face steel knight helmet', 'halfhelm': 'steel half helmet', 'horned': 'horned helmet', 'bandana': '{acc} bandana',
       'widehat': 'wide-brim leather hat', 'cap': 'feathered cap', 'circlet': 'golden circlet with a gem', 'crown': 'golden crown',
       'mitre': 'tall white bishop mitre', 'mask': 'cloth mask over the mouth', 'tophat': 'black top hat', 'beret': '{acc} beret',
       'chefhat': 'white chef hat', 'nightcap': 'long sleeping nightcap with pompom', 'mimic': 'treasure chest worn as a helmet',
       'officer': 'military officer cap', 'goggles': 'brass goggles on the forehead'}
WPN = {'none': 'bare hands', 'staff': 'magic staff with a glowing crystal', 'skullstaff': 'skull-topped staff', 'crook': "shepherd's crook",
       'pitchfork': 'pitchfork', 'scythe': 'large scythe', 'flag': 'banner flag on a pole', 'mop': 'mop', 'spear': 'long spear',
       'bow': 'wooden longbow', 'crossbow': 'crossbow', 'gun': 'flintlock musket', 'sword': 'steel longsword', 'greatsword': 'huge two-handed greatsword',
       'katana': 'katana', 'rapier': 'rapier', 'dagger': 'twin daggers', 'axe': 'battle axe', 'hammer': 'war hammer', 'whip': 'whip',
       'fist': 'glowing gauntlet fists', 'book': 'spell book', 'scroll': 'rolled scroll', 'quill': 'giant feather quill', 'flask': 'glowing potion flask',
       'lantern': 'glowing lantern', 'coin': 'bag of gold coins', 'cards': 'fan of playing cards', 'lute': 'lute', 'brush': 'giant paintbrush',
       'baton': 'conductor baton', 'wrench': 'big wrench', 'ladle': 'big ladle', 'telescope': 'brass telescope'}
BODY = {'robe': 'long {main} robe coat with gold trim', 'armor': '{main} plate armor', 'coat': '{main} leather coat', 'light': '{main} tunic'}

def cname(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)); hu, l, s = colorsys.rgb_to_hls(r, g, b); hu *= 360
    if l < .16: return 'black'
    if s < .16: return 'white' if l > .8 else 'silver' if l > .5 else 'dark gray'
    n = 'red' if hu < 15 or hu >= 345 else 'orange' if hu < 40 else 'gold' if hu < 65 else 'green' if hu < 160 else 'teal' if hu < 190 else 'blue' if hu < 250 else 'purple' if hu < 290 else 'pink'
    return ('dark ' if l < .33 else 'light ' if l > .72 else '') + n

def prompt(j):
    c = {'main': cname(j['main']), 'acc': cname(j['acc'])}
    # most important first: CLIP reads only 77 tokens
    parts = [f"{j['id'].replace('-', ' ')} holding a {WPN[j['wpn']]}" + (f" and a {c['acc']} shield" if j.get('shield') else ''), HAT[j['hat']].format(**c),
             BODY[j['body']].format(**c), f"{cname(j['hair'])} hair", 'cute face']
    if j['tier'] >= 2: parts.append(f"{c['acc']} cape")
    if j['tier'] >= 3: parts.append('legendary glowing aura')
    parts.append(f"{cname(j['glow'])} sparkles")
    return ', '.join(parts) + ', chibi pixel art, big eyes, gold trim, dark starry background, full body'

def recolor(img, main, glow):
    # move the reference's navy/blue cloth to the job's main colour, and its blue glow to the job's glow colour
    hsv = np.array(img.convert('HSV')).astype(float)
    hu, sa, va = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    def target(h):
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)); th, ts, tv = colorsys.rgb_to_hsv(r, g, b); return th * 255, ts * 255, tv * 255
    blue = (hu > 140) & (hu < 210) & (sa > 60)
    cloth, glowy = blue & (va < 170), blue & (va >= 170)
    for m, (th, ts, tv) in ((cloth, target(main)), (glowy, target(glow))):
        hu[m] = th; sa[m] = np.clip(sa[m] * .4 + ts * .6, 0, 255); va[m] = np.clip(va[m] * (.55 + tv / 255 * .7), 0, 255)
    return Image.fromarray(np.stack([hu, sa, va], -1).astype('uint8'), 'HSV').convert('RGB')

def init_image(path):
    a = np.array(Image.open(path).convert('RGB')).astype(float); h, w, _ = a.shape
    ys, xs = np.mgrid[0:h, 0:w]
    staff = (xs < .36 * w) & (ys < .92 * h) & ~((xs > .27 * w) & (ys > .42 * h))  # the reference staff, so each job can hold its own weapon
    a[staff] = [14, 12, 26]
    return Image.fromarray(a.astype('uint8')).resize((512, 512), Image.LANCZOS)

if __name__ == '__main__':
    ref, jobs_path, out = sys.argv[1:4]; only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else None
    jobs = [j for j in json.load(open(jobs_path)) if not only or j['id'] in only]
    os.makedirs(out, exist_ok=True)
    pipe = AutoPipelineForImage2Image.from_pretrained('stabilityai/sd-turbo', torch_dtype=torch.float32); pipe.set_progress_bar_config(disable=True)
    init = init_image(ref); meta = {}
    for k, j in enumerate(jobs):
        dst = os.path.join(out, j['id'] + '.png')
        if os.path.exists(dst): continue
        p = prompt(j); seed = int(hashlib.md5(j['id'].encode()).hexdigest()[:8], 16)
        t = time.time()
        im = pipe(prompt=p, image=recolor(init, j['main'], j['glow']), strength=.64, num_inference_steps=5, guidance_scale=0.0, generator=torch.Generator().manual_seed(seed)).images[0]
        im.save(dst); meta[j['id']] = {'prompt': p, 'seed': seed}
        print(f"[{k + 1}/{len(jobs)}] {j['id']} {time.time() - t:.0f}s", flush=True)
    with open(os.path.join(out, 'prompts.json'), 'a') as f: f.write(json.dumps(meta, ensure_ascii=False) + '\n')
