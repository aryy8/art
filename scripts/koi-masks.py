# Builds koi-pond plates from the target painting (TARGET_FINAL / target-final.png):
#   fish-free plate (RGBA, paper → transparent), water mask, fish masks (debug), fin sprite.
# python3 scripts/koi-masks.py
import numpy as np, cv2
from PIL import Image
A = "src/pieces/koi-pond/assets/"
T = A + "target-final.png"
img = np.asarray(Image.open(T).convert("RGB")).astype(np.float32)
H, Wd = img.shape[:2]
r, g, b = img[..., 0], img[..., 1], img[..., 2]
hsv = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hue, sat, val = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255

# --- paper (outside torn edge): bright + low saturation, connected to the border
paper = ((val > 0.80) & (sat < 0.16)).astype(np.uint8)
n, lab = cv2.connectedComponents(paper)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
paper = np.isin(lab, list(border)).astype(np.uint8)
paper = cv2.morphologyEx(paper, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
inside = 1 - paper
# soft alpha: paper fades out, pastel crumbs stay
whiteness = np.clip((val - 0.78) / 0.12, 0, 1) * np.clip((0.2 - sat) / 0.1, 0, 1)
near = cv2.dilate(paper, np.ones((9, 9), np.uint8))
alpha = np.where(near > 0, 1 - whiteness, 1.0)
alpha[paper > 0] = np.minimum(alpha[paper > 0], 1 - whiteness[paper > 0])
alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.6)

# --- flora (pads + lotus): green-yellow or pink, big connected blobs
green = (hue > 55) & (hue < 110) & (sat > 0.35) & (val > 0.35)
pink = ((hue > 300) | (hue < 25)) & (r > 150) & (b > 90) 
fl = (green | pink).astype(np.uint8)
fl = cv2.morphologyEx(fl, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
fl = cv2.morphologyEx(fl, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
n, lab, st, _ = cv2.connectedComponentsWithStats(fl)
flora = np.zeros_like(fl)
for i in range(1, n):
    if st[i, cv2.CC_STAT_AREA] > 9000: flora[lab == i] = 1
# fill holes + include dark rims
cnts, _ = cv2.findContours(flora, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
flora = np.zeros_like(flora); cv2.drawContours(flora, cnts, -1, 1, -1)
flora = cv2.dilate(flora, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
# the lotus (pale petals are missed by colour) + its leaf and the dark foliage in that corner:
# a generous hand-drawn region, so no water effect can ever touch it
lotus = np.zeros_like(flora)
cv2.fillPoly(lotus, [np.array([(0, 0), (520, 0), (520, 120), (500, 230), (470, 330), (360, 365), (250, 400), (150, 420), (0, 430)])], 1)
# fish only hide under the lotus itself (not the whole corner): polygon minus open teal water
teal = (hue > 165) & (hue < 235) & (sat > 0.3)
lotus_occ = (lotus > 0) & ~teal
lotus_occ = cv2.morphologyEx(lotus_occ.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
lotus_occ = cv2.morphologyEx(lotus_occ, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(lotus_occ)
keep_ = np.zeros_like(lotus_occ)
for i_ in range(1, n_):
    if st_[i_, cv2.CC_STAT_AREA] > 3000: keep_[lab_ == i_] = 1
pads_only = flora.copy()
flora |= lotus
# every pad: fill holes so rims + veins are fully inside, then pad by a safety margin
cnts, _ = cv2.findContours(flora, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
flora = np.zeros_like(flora); cv2.drawContours(flora, cnts, -1, 1, -1)
flora = cv2.dilate(flora, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
flora &= inside

# --- fish: warm pixels inside two hand-placed regions around the painted koi
warm = (r > b + 18) & (r > g * 0.92) & (hue < 60) | ((val > 0.72) & (sat < 0.35) & (r >= b))
regions = np.zeros((H, Wd), np.uint8)
cv2.fillPoly(regions, [np.array([(330, 300), (580, 290), (760, 400), (780, 580), (580, 600), (540, 690), (470, 800), (280, 730), (160, 470), (200, 380)])], 1)
cv2.fillPoly(regions, [np.array([(700, 540), (900, 500), (1000, 380), (1120, 330), (1240, 360), (1290, 480), (1250, 660), (1060, 790), (880, 830), (770, 790), (700, 690)])], 1)
fish = (warm & (regions > 0)).astype(np.uint8)
fish = cv2.morphologyEx(fish, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(fish)
keep = np.zeros_like(fish)
for i in range(1, n):
    if st[i, cv2.CC_STAT_AREA] > 400: keep[lab == i] = 1
fish = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
# the painted koi cast dark teal shadows: grab dark pixels hugging the fish too
shadow = (val < 0.24) & (cv2.dilate(fish, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0)
fish = fish | cv2.dilate(shadow.astype(np.uint8), np.ones((7, 7), np.uint8))
fish &= regions | cv2.dilate(regions, np.ones((15, 15), np.uint8))

fish &= (cv2.dilate(flora, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (35, 35))) == 0).astype(np.uint8)

# --- remove fish: per hole component, copy the best-matching offset patch of water, then Poisson-blend
hole = fish.astype(bool)
src_ok = (~hole) & (cv2.dilate(flora, np.ones((25, 25), np.uint8)) == 0) & (cv2.erode(inside, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0)
src_ok[:380, :500] = False  # lotus leaves / stems
src_ok = cv2.erode(src_ok.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
fill = img.copy()
offs = [(dx, dy) for dx in range(-640, 641, 40) for dy in range(-480, 481, 40) if abs(dx) + abs(dy) > 120]
n, lab = cv2.connectedComponents(fish)
ring_all = cv2.dilate(fish, np.ones((15, 15), np.uint8)) - fish
for ci in range(1, n):
    comp = lab == ci
    ring = (ring_all > 0) & cv2.dilate(comp.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
    left = comp.copy()
    scored = []
    ys, xs = np.nonzero(comp); ry, rx = np.nonzero(ring)
    for dx, dy in offs:
        sy, sx = ys - dy, xs - dx
        v = (sy >= 0) & (sy < H) & (sx >= 0) & (sx < Wd)
        cov = v.copy(); cov[v] = src_ok[sy[v], sx[v]]
        if cov.mean() < 0.5: continue
        sry, srx = np.clip(ry - dy, 0, H - 1), np.clip(rx - dx, 0, Wd - 1)
        err = np.abs(img[sry, srx] - img[ry, rx]).mean()
        scored.append((-(cov.mean()) * 60 + err, dx, dy))
    scored.sort()
    for _, dx, dy in scored[:12]:
        yy, xx = np.nonzero(left)
        sy, sx = yy - dy, xx - dx
        v = (sy >= 0) & (sy < H) & (sx >= 0) & (sx < Wd)
        ok = np.zeros_like(v); ok[v] = src_ok[sy[v], sx[v]]
        fill[yy[ok], xx[ok]] = img[sy[ok], sx[ok]]
        left[yy[ok], xx[ok]] = False
        if not left.any(): break
    if left.any():
        low = cv2.inpaint(fill.astype(np.uint8), left.astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA)
        fill[left] = low[left]
plate = img.copy()
for ci in range(1, n):
    comp = (lab == ci).astype(np.uint8)
    x, y, w, h = cv2.boundingRect(comp)
    pad = 12
    x0, y0, x1, y1 = max(x - pad, 1), max(y - pad, 1), min(x + w + pad, Wd - 1), min(y + h + pad, H - 1)
    msk = (cv2.dilate(comp, np.ones((9, 9), np.uint8)) * 255)[y0:y1, x0:x1]
    src = fill[y0:y1, x0:x1].astype(np.uint8)
    out = cv2.seamlessClone(src, plate.astype(np.uint8), msk, ((x0 + x1) // 2, (y0 + y1) // 2), cv2.NORMAL_CLONE)
    plate = out.astype(np.float32)

rgba = np.dstack([plate, alpha[..., None] * 255]).astype(np.uint8)
Image.fromarray(rgba).save(A + "pond-final.png")
# water mask: R = water (distort + fish visible), G = soft distortion weight (eroded, so pads never smear)
water = ((flora == 0) & (inside > 0)).astype(np.uint8)
occ = pads_only | keep_
cnts, _ = cv2.findContours(occ, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
occ = np.zeros_like(occ); cv2.drawContours(occ, cnts, -1, 1, -1)
occ = cv2.dilate(occ, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
fishvis = ((occ == 0) & (inside > 0)).astype(np.float32)
# R: fish visible (hard), B: water surface effects (hard), G: displacement weight (eroded)
# R: hard water mask (full res, binary) — shader thresholds it, so nothing leaks onto flora
# G: displacement weight — eroded 28px + feathered, exactly 0 on and near every pad / the lotus
hard = water.astype(np.float32)
soft = cv2.GaussianBlur(cv2.erode(water, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (57, 57))).astype(np.float32), (0, 0), 6)
soft[cv2.dilate(1 - water, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0] = 0
mk = np.dstack([fishvis, soft, hard]) * 255
Image.fromarray(mk.astype(np.uint8)).save(A + "water-mask-final.png")
dbg = img.copy(); dbg[fish > 0] = dbg[fish > 0] * 0.4 + np.array([255, 0, 255]) * 0.6
dbg[flora > 0] = dbg[flora > 0] * 0.6 + np.array([0, 255, 0]) * 0.4
Image.fromarray(dbg.astype(np.uint8)).save("/workspace/art-work/tmp/masks-debug.png")
print("ok")

# --- pectoral fin sprite cut from koi-pair-pose.png (root on the left, tip to the right)
p = Image.open(A + "koi-pair-pose.png").convert("RGBA").crop((515, 280, 660, 352))
a = np.asarray(p).astype(np.float32)
yel = np.clip((a[..., 1] / np.maximum(a[..., 0], 1) - 0.62) / 0.12, 0, 1)
a[..., 3] *= yel
fin = Image.fromarray(a.astype(np.uint8)).rotate(-18, resample=Image.BICUBIC, expand=True)
fin = fin.crop(fin.getbbox())
fa = np.asarray(fin).astype(np.float32)
w = fa.shape[1]
ramp = np.clip((np.arange(w) / w - 0.04) / 0.12, 0, 1)  # drop orange body specks at the root
fa[..., 3] *= ramp[None, :]
Image.fromarray(fa.astype(np.uint8)).save(A + "fin-final.png")

Image.open(A + "pond-final.png").save(A + "pond-final.webp", quality=90, method=6)

# --- colour-bleed sprites so mipmaps/bilinear never pull black into translucent fin/tail edges
def bleed(src, dst):
    im = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
    rgb, al = im[..., :3], im[..., 3]
    known = al > 8
    acc = rgb * known[..., None]; wsum = known.astype(np.float32)
    k = (0, 0)
    for s in (1, 2, 4, 8, 16, 32, 64):
        a2 = cv2.GaussianBlur(acc, (0, 0), s); w2 = cv2.GaussianBlur(wsum, (0, 0), s)
        fillc = a2 / np.maximum(w2, 1e-6)[..., None]
        miss = (~known) & (w2 > 1e-4)
        rgb[miss] = fillc[miss]; acc = rgb * 1.0; wsum = np.maximum(wsum, (w2 > 1e-4).astype(np.float32))
        known = known | miss
    out = np.dstack([rgb, al]).astype(np.uint8)
    Image.fromarray(out).save(dst, **({"quality": 92, "method": 6, "exact": True} if dst.endswith(".webp") else {}))
bleed(A + "koi.png", A + "koi-final.webp")
bleed(A + "fin-final.png", A + "fin-final.png")
