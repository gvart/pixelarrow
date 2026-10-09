"""
Cut the artist's icon sheets into the game's icon atlases (docs/icons/README.md).

    npm run icons -- <sheets dir> [--qa <dir>]

<sheets dir> holds sheet_1.jpg ... sheet_N.jpg: 4 x 4 cells on flat magenta, the
cell order of the README's sheet tables. An id on a later sheet (re-rolls) wins. Every cell becomes one transparent icon,
packed into public/icons/ui.png (UI, camp, sync badges, powers at 64 px) and
public/icons/items.png (items, trinkets, goods at 96 px), each with its JSON frame
list for Phaser. QA contact sheets (each icon on a checkerboard with its id) go to
shots/icons/ unless --qa says otherwise.

Needs Python 3 with Pillow, numpy, scipy and imagequant (pip install ...).
"""
import json
import math
import os
import re
import sys

import imagequant
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
UI_PREFIX = ('ui:', 'camp:', 'chrome:', 'power:')
UI_PX, ITEM_PX = 64, 96


def read_map(readme):
    """{sheet: [ids in cell order]} from the README's sheet tables."""
    out, sheet = {}, None
    for line in open(readme, encoding='utf8'):
        m = re.match(r'## Sheet (\d+):', line)
        if m:
            sheet = int(m.group(1))
            out[sheet] = []
            continue
        m = re.match(r'\| (\d+) \| R\d C\d \| [^|]+\| `([^`]+)` \|', line)
        if m and sheet:
            out[sheet].append(m.group(2))
    return out


def bg_color(a):
    """The sheet's magenta: median of a 6 px frame round the sheet (JPEG shifts it a little)."""
    e = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    return np.median(e, axis=0)


def cut_icon(cell, bg):
    """One cell (float RGB) -> RGBA icon cropped to its content, or None if empty."""
    n = cell.shape[0]
    d = np.sqrt(((cell - bg) ** 2).sum(-1))
    mag = np.minimum(cell[..., 0], cell[..., 2]) - cell[..., 1]
    alpha = np.clip((d - 60) / 90, 0, 1)
    # strongly magenta pixels are background even where JPEG shifted them
    alpha[(mag > 150) & (d < 200)] = 0
    # a pixel on the line from a colour to the magenta (smoke, glow, thin gaps between shafts)
    # is part background: t = its magenta share, judged by red and blue rising together over green
    bgmag = max(1.0, min(bg[0], bg[2]) - bg[1])
    rb_close = np.abs(cell[..., 0] - cell[..., 2]) < 0.45 * np.maximum(cell[..., 0], cell[..., 2]) + 12
    t = np.where(rb_close & (mag > 25), np.clip((mag - 25) / (bgmag - 25), 0, 1), 0)
    alpha = alpha * (1 - t)
    cell = np.where(t[..., None] > 0, np.clip((cell - t[..., None] * bg) / np.maximum(1 - t[..., None], 0.05), 0, 255), cell)
    # unmixing overshoots into green on thin edges: a pixel that was magenta-tinted stays neutral
    cell[..., 1] = np.where(t > 0, np.minimum(cell[..., 1], np.maximum(cell[..., 0], cell[..., 2]) * 1.02 + 6), cell[..., 1])
    # drop specks and pieces of neighbours poking over the cell edge
    mask = alpha > 0.5
    lab, k = ndimage.label(mask)
    if k:
        sizes = ndimage.sum(mask, lab, range(1, k + 1))
        big = sizes.max()
        keep = np.zeros(k + 1, bool)
        for j in range(1, k + 1):
            ys, xs = np.where(lab == j)
            edge = ys.min() == 0 or xs.min() == 0 or ys.max() == n - 1 or xs.max() == n - 1
            keep[j] = sizes[j - 1] >= 0.02 * big and not (edge and sizes[j - 1] < 0.25 * big)
        alpha = alpha * ndimage.binary_dilation(keep[lab], iterations=3)
    # unmix the background from soft edges
    aa = alpha[..., None]
    rgb = np.clip(np.where(aa > 0.02, (cell - (1 - aa) * bg) / np.maximum(aa, 0.02), 0), 0, 255)
    # a magenta cast left on the rim: pull red and blue down towards green
    rim = (alpha < 0.98) & (alpha > 0)
    fix = rim & (np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] > 30)
    for ch in (0, 2):
        rgb[..., ch] = np.where(fix, np.minimum(rgb[..., ch], rgb[..., 1] + 30), rgb[..., ch])
    # the outline band: JPEG mixed the magenta into the dark ink; there a magenta cast becomes ink brown
    inside = ndimage.distance_transform_edt(alpha > 0.5)
    bad = (inside < 5) & (alpha > 0) & (np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] > 8)
    v = rgb.mean(-1)
    rgb = np.where(bad[..., None], np.clip(np.dstack([v * 1.25, v * 0.9, v * 0.62]), 0, 255), rgb)
    # JPEG chroma subsampling leaves a green seam beside the magenta: dark rim pixels leaning green go neutral
    hi_rb = np.maximum(rgb[..., 0], rgb[..., 2])
    seam = (inside < 4) & (alpha > 0) & (rgb[..., 1] > hi_rb + 6) & (rgb.mean(-1) < 130)
    rgb[..., 1] = np.where(seam, hi_rb, rgb[..., 1])
    icon = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    bb = icon.getchannel('A').point(lambda x: 255 if x > 24 else 0).getbbox()
    return icon.crop(bb) if bb else None


def square(icon, size):
    """Centre on a square with a 4% margin, down to `size` px."""
    w, h = icon.size
    side = int(max(w, h) * 1.08)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(icon, ((side - w) // 2, (side - h) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def cut_sheets(src, mapping):
    icons = {}
    for sheet, ids in mapping.items():
        path = os.path.join(src, f'sheet_{sheet}.jpg')
        if not os.path.exists(path):
            print(f'sheet {sheet}: missing {path}, its icons keep their previous art')
            continue
        a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
        bg = bg_color(a)
        n = a.shape[0] // 4
        for i, iid in enumerate(ids):
            r, c = divmod(i, 4)
            icon = cut_icon(a[r * n:(r + 1) * n, c * n:(c + 1) * n].copy(), bg)
            if icon is None:
                print(f'{iid}: empty cell')
                continue
            size = UI_PX if iid.startswith(UI_PREFIX) else ITEM_PX
            if iid.startswith('chrome:'):
                # wide cloud and tall banner keep their proportions
                k = size / max(icon.size)
                icons[iid] = icon.resize((max(1, round(icon.width * k)), max(1, round(icon.height * k))), Image.LANCZOS)
            else:
                icons[iid] = square(icon, size)
    return icons


def pack(icons, ids, cell, out_dir, name):
    cols = math.ceil(math.sqrt(len(ids)))
    rows = math.ceil(len(ids) / cols)
    pad = 2  # keeps LINEAR filtering from bleeding neighbours in
    W, H = cols * (cell + pad), rows * (cell + pad)
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames = {}
    for k, iid in enumerate(ids):
        im = icons[iid]
        x, y = (k % cols) * (cell + pad), (k // cols) * (cell + pad)
        sheet.paste(im, (x, y))
        frames[iid] = {'frame': {'x': x, 'y': y, 'w': im.width, 'h': im.height}, 'rotated': False, 'trimmed': False,
                       'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height}, 'sourceSize': {'w': im.width, 'h': im.height}}
    # 8-bit palette with alpha: a quarter of the size, no visible loss at icon sizes
    q = imagequant.quantize_pil_image(sheet, dithering_level=1.0, max_colors=256, min_quality=0, max_quality=100)
    q.save(os.path.join(out_dir, f'{name}.png'), optimize=True)
    with open(os.path.join(out_dir, f'{name}.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': {'image': f'{name}.png', 'size': {'w': W, 'h': H}, 'scale': 1, 'format': 'RGBA8888'}}, f, separators=(',', ':'))
    print(f'{name}.png: {len(ids)} icons, {W}x{H}, {os.path.getsize(os.path.join(out_dir, name + ".png")) // 1024} KB')


def previous_icons(out_dir):
    """Icons already in the atlases (kept for sheets not given this time)."""
    icons = {}
    for name in ('ui', 'items'):
        jp, pp = os.path.join(out_dir, f'{name}.json'), os.path.join(out_dir, f'{name}.png')
        if not (os.path.exists(jp) and os.path.exists(pp)):
            continue
        img = Image.open(pp).convert('RGBA')
        for iid, f in json.load(open(jp))['frames'].items():
            r = f['frame']
            icons[iid] = img.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    return icons


def qa_sheets(mapping, icons, dst):
    os.makedirs(dst, exist_ok=True)
    S = 160
    for sheet, ids in mapping.items():
        o = Image.new('RGB', (4 * S, ((len(ids) + 3) // 4) * (S + 14)), (40, 36, 32))
        d = ImageDraw.Draw(o)
        for i, iid in enumerate(ids):
            if iid not in icons:
                continue
            r, c = divmod(i, 4)
            x, y = c * S, r * (S + 14)
            for yy in range(0, S, 16):
                for xx in range(0, S, 16):
                    d.rectangle([x + xx, y + yy, x + xx + 15, y + yy + 15], fill=(58, 52, 46) if (xx + yy) // 16 % 2 else (88, 80, 72))
            im = icons[iid]
            k = (S - 16) / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            o.paste(im, (x + (S - im.width) // 2, y + (S - im.height) // 2), im)
            d.text((x + 3, y + S), iid, fill=(255, 255, 255))
        o.save(os.path.join(dst, f'qa_{sheet:02d}.png'))
    print(f'QA sheets: {dst}')


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        print(__doc__)
        sys.exit(1)
    src = args[0]
    qa = args[args.index('--qa') + 1] if '--qa' in args else os.path.join(ROOT, 'shots', 'icons')
    out_dir = os.path.join(ROOT, 'public', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    mapping = read_map(os.path.join(ROOT, 'docs', 'icons', 'README.md'))
    icons = previous_icons(out_dir)
    icons.update(cut_sheets(src, mapping))
    # an id on a later sheet (re-rolls, sheet 20) replaced its earlier cell in cut_sheets; list it once
    ids = list(dict.fromkeys(i for v in mapping.values() for i in v if i in icons))
    pack(icons, [i for i in ids if i.startswith(UI_PREFIX)], UI_PX, out_dir, 'ui')
    pack(icons, [i for i in ids if not i.startswith(UI_PREFIX)], ITEM_PX, out_dir, 'items')
    qa_sheets(mapping, icons, qa)


if __name__ == '__main__':
    main()
