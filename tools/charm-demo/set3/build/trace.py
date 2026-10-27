"""從設計總表圖片描出刀模、彩圖與白墨。

版面是固定的：一張圓角矩形卡片（含中央插槽），以及卡片下方的中片輪廓與掛孔。
像素座標寫在腳本裡，換一張不同排版的總表時要跟著改。
比例預設 29.95mm / 175px，可用 --mm-per-px 覆寫。
輸出每個零件一個資料夾（art.png、white.png、cut.json、cut.svg）。這些圖是執行結果，不要提交。

用法：
  python trace.py --src sheet.jpg --out ./traced
"""
import argparse, os, json

ap = argparse.ArgumentParser(description='從設計總表描刀模與貼圖')
ap.add_argument('--src', required=True, help='設計總表圖片路徑（不會寫進 repo）')
ap.add_argument('--out', required=True, help='輸出資料夾')
ap.add_argument('--mm-per-px', type=float, default=29.95 / 175.0, help='總表比例，預設 29.95mm / 175px')
ap.add_argument('--card-name', default='card', help='卡片輸出資料夾名稱')
ap.add_argument('--mid-name', default='mid', help='中片輸出資料夾名稱')
ap.add_argument('--debug', action='store_true', help='把中片遮罩寫到輸出資料夾')
args = ap.parse_args()
try:
    import cv2
    import numpy as np
    from scipy import ndimage as ndi
except ImportError as e:
    raise SystemExit('trace.py 需要 opencv-python、numpy、scipy：' + str(e)) from e
SRC = args.src
OUT = args.out
S = args.mm_per_px       # mm / px（總表）
UP = 4                      # 貼圖放大倍率
PXMM = UP / S               # 貼圖 px / mm
img = cv2.imread(SRC)[:, :, ::-1]
I = img.astype(int); R, G, B = I[..., 0], I[..., 1], I[..., 2]

def chaikin(p, n=2):
    for _ in range(n):
        q = np.roll(p, -1, 0); p = np.stack([0.75 * p + 0.25 * q, 0.25 * p + 0.75 * q], 1).reshape(-1, 2)
    return p

def save_piece(name, x0, y0, rgb_up, alpha_up, white_up, outer_px, circles=(), polys=(), extra=None):
    """outer_px 等座標為總表 px（全圖座標）；轉成 mm（以裁切左上角 x0,y0 為原點）"""
    import os; os.makedirs(f'{OUT}/{name}', exist_ok=True)
    rgba = np.dstack([rgb_up, alpha_up]).astype(np.uint8)
    cv2.imwrite(f'{OUT}/{name}/art.png', cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
    w = np.dstack([np.zeros_like(white_up)] * 3 + [white_up]).astype(np.uint8)
    cv2.imwrite(f'{OUT}/{name}/white.png', cv2.cvtColor(w, cv2.COLOR_RGBA2BGRA))
    mm = lambda p: ((np.asarray(p, float) - [x0, y0]) * S).round(4).tolist()
    d = {'units': 'mm', 'coords': f'traced from design sheet JPG, origin = sheet px ({x0},{y0}), y down', 'mm_per_sheet_px': S,
         'outer': mm(outer_px),
         'circles': [{'cx': round((c[0] - x0) * S, 4), 'cy': round((c[1] - y0) * S, 4), 'r': round(c[2], 4)} for c in circles],
         'polyHoles': [mm(p) for p in polys],
         'texture': {'dpi': PXMM * 25.4, 'origin_mm': [0, 0]}}
    if extra: d.update(extra)
    # 主孔（掛環用）
    if d['circles']: d['hole'] = d['circles'][0]
    json.dump(d, open(f'{OUT}/{name}/cut.json', 'w'))
    o = np.array(d['outer']); bb = o.max(0)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{bb[0]+1:.2f}mm" height="{bb[1]+1:.2f}mm" viewBox="-0.5 -0.5 {bb[0]+1:.3f} {bb[1]+1:.3f}">',
           '<path fill="none" stroke="#e4007f" stroke-width="0.15" d="M' + ' L'.join(f'{a:.3f},{b:.3f}' for a, b in o) + ' Z"/>']
    for c in d['circles']: svg.append(f'<circle cx="{c["cx"]}" cy="{c["cy"]}" r="{c["r"]}" fill="none" stroke="#e4007f" stroke-width="0.15"/>')
    for p in d['polyHoles']: svg.append('<path fill="none" stroke="#e4007f" stroke-width="0.15" d="M' + ' L'.join(f'{a:.3f},{b:.3f}' for a, b in p) + ' Z"/>')
    open(f'{OUT}/{name}/cut.svg', 'w').write('\n'.join(svg) + '</svg>')
    print(name, 'outer mm bbox', np.array(d['outer']).min(0), np.array(d['outer']).max(0), 'circles', d['circles'], extra or '')

# ---------------- 卡（上片） ----------------
L, T_, Rr, Bt = 1217.5, 50.5, 1452.0, 344.0          # 藍色刀模線中心
sx0, sx1, sy0, sy1 = 1326.5, 1342.5, 192.5, 265.5    # 插槽線中心
scx, scy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
SLOT_W, SLOT_H = 3.0 / S, 12.8 / S                   # 實物：3mm 板要插得進去，槽寬取 3.0mm（總表量約 2.7mm）
x0, y0 = int(L) - 2, int(T_) - 2
crop = img[y0:int(Bt) + 3, x0:int(Rr) + 3].copy()
# 把藍色刀模線與槽內白底換成鄰近色（刀模線不印）
blue = (crop[..., 2].astype(int) > 150) & (crop[..., 0].astype(int) < 150) & (crop[..., 2].astype(int) - crop[..., 0].astype(int) > 50)
slot_in = np.zeros(blue.shape, bool)
yy, xx = np.mgrid[:blue.shape[0], :blue.shape[1]]
slot_in = (xx + x0 >= sx0 - 2) & (xx + x0 <= sx1 + 2) & (yy + y0 >= sy0 - 2) & (yy + y0 <= sy1 + 2)
bad = (blue | slot_in).astype(np.uint8)
crop = cv2.inpaint(crop, cv2.dilate(bad, np.ones((3, 3), np.uint8)), 4, cv2.INPAINT_TELEA)
up = cv2.resize(crop, None, fx=UP, fy=UP, interpolation=cv2.INTER_LANCZOS4)
H, W = up.shape[:2]
alpha = np.zeros((H, W), np.uint8)
cv2.rectangle(alpha, (int((L - x0) * UP), int((T_ - y0) * UP)), (int((Rr - x0) * UP), int((Bt - y0) * UP)), 255, -1)
hx0, hx1 = (scx - SLOT_W / 2 - x0) * UP, (scx + SLOT_W / 2 - x0) * UP
hy0, hy1 = (scy - SLOT_H / 2 - y0) * UP, (scy + SLOT_H / 2 - y0) * UP
cv2.rectangle(alpha, (int(hx0), int(hy0)), (int(hx1), int(hy1)), 0, -1)
def rrect(x0_, y0_, x1_, y1_, r, n=6):
    pts = []
    for cx, cy, a0 in [(x1_ - r, y0_ + r, -np.pi / 2), (x1_ - r, y1_ - r, 0), (x0_ + r, y1_ - r, np.pi / 2), (x0_ + r, y0_ + r, np.pi)]:
        for i in range(n + 1):
            a = a0 + i / n * np.pi / 2; pts.append([cx + r * np.cos(a), cy + r * np.sin(a)])
    return pts
outer = rrect(L, T_, Rr, Bt, 1.0 / S)          # 角落 R1mm
slot = rrect(scx - SLOT_W / 2, scy - SLOT_H / 2, scx + SLOT_W / 2, scy + SLOT_H / 2, 0.4 / S, 3)
save_piece(args.card_name, x0, y0, up[..., :3], alpha, alpha, outer, polys=[slot[::-1]],
           extra={'mount': {'slot': {'cx': round((scx - x0) * S, 4), 'cy': round((scy - y0) * S, 4), 'w': 3.0, 'h': 12.8}}})

# ---------------- 中片 ----------------
x0, y0, x1, y1 = 1188, 360, 1498, 702
c = I[y0:y1, x0:x1]; r, g, b = c[..., 0], c[..., 1], c[..., 2]
line = ((r - g) > 22) & ((b - g) > 18) & (r > 150) & ~((b - g) > 0) | (((r - g) > 40) & ((b - g) > 35))
line = ((r - g) > 22) & ((b - g) > 18) & (r > 150)
# 洞（掛孔）：圓心、半徑由放大圖量得
hole_c = (1288.8, 675.5); HOLE_R = 1.25
# 先把掛孔圓圈線從「外框線」裡去掉，避免洞被當成外部
hy, hx = np.mgrid[y0:y1, x0:x1]
near_hole = (hx - hole_c[0]) ** 2 + (hy - hole_c[1]) ** 2 < 10.5 ** 2
lb = line & ~near_hole
lb = cv2.dilate(lb.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1)
# 從外圍 flood fill，沒被灌到的就是刀模內
ff = np.pad(lb, 1, constant_values=0).copy()
mask = np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8)
cv2.floodFill(ff, mask, (0, 0), 2)
inside = (ff[1:-1, 1:-1] != 2)
inside = ndi.binary_fill_holes(inside)
inside = cv2.erode(inside.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)  # 回到線中心
print('mid inside area px', inside.sum())
lab, n = ndi.label(inside); sizes = ndi.sum(inside, lab, range(1, n + 1)); inside = lab == (np.argmax(sizes) + 1)
# 平滑輪廓
up_in = cv2.resize(inside.astype(np.float32), None, fx=UP, fy=UP, interpolation=cv2.INTER_LINEAR)
up_in = cv2.GaussianBlur(up_in, (0, 0), 2.5) > 0.5
cs, _ = cv2.findContours(up_in.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cnt = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
# 等距重取樣 → 沿輪廓高斯平滑（去掉 JPG 鋸齒，避免側邊出現條紋）→ 簡化
seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([cnt, cnt[:1]]), axis=0), axis=1))]
n = int(seg[-1] / 1.0); u = np.linspace(0, seg[-1], n, endpoint=False)
cl = np.vstack([cnt, cnt[:1]])
cnt = np.stack([np.interp(u, seg, cl[:, 0]), np.interp(u, seg, cl[:, 1])], 1)
cnt = np.stack([ndi.gaussian_filter1d(cnt[:, 0], 5, mode='wrap'), ndi.gaussian_filter1d(cnt[:, 1], 5, mode='wrap')], 1)
cnt = cv2.approxPolyDP(cnt.astype(np.float32), 0.35, True)[:, 0, :].astype(float)
outer = cnt / UP + [x0, y0]
# 彩圖：非白、非刀模線
up_rgb = cv2.resize(img[y0:y1, x0:x1], None, fx=UP, fy=UP, interpolation=cv2.INTER_LANCZOS4)
mn = c.min(2); notwhite = (255 - mn) > 28
art = notwhite & ~line & inside & ~near_hole
art = ndi.binary_opening(art, iterations=1)
# 小的封閉空白（臉、衣服白色部分）也印白墨＋白色
filled = ndi.binary_fill_holes(art)
holes = filled & ~art; hl, hn = ndi.label(holes)
hs = ndi.sum(holes, hl, range(1, hn + 1))
small = np.isin(hl, [i + 1 for i, s in enumerate(hs) if s < 900])
art = art | small
a_up = cv2.resize(art.astype(np.float32), None, fx=UP, fy=UP, interpolation=cv2.INTER_LINEAR)
a_up = (np.clip((cv2.GaussianBlur(a_up, (0, 0), 1.2) - 0.5) * 6 + 0.5, 0, 1) * 255).astype(np.uint8)
# 洞內清空
cv2.circle(a_up, (int((hole_c[0] - x0) * UP), int((hole_c[1] - y0) * UP)), int((HOLE_R / S + 2) * UP), 0, -1)
# 白色區域在 JPG 裡是白的 → 彩圖像素保留原色即可
# 插片（tab）：總表上 x≈1471.5~1488.5、y≈383~457（線中心）
tab = {'x0': 1471.5, 'x1': 1488.5, 'y0': 383.0, 'y1': 457.0}
tcx, tcy = (tab['x0'] + tab['x1']) / 2, (tab['y0'] + tab['y1']) / 2
save_piece(args.mid_name, x0, y0, up_rgb, a_up, a_up, outer, circles=[(hole_c[0], hole_c[1], HOLE_R)],
           extra={'mount': {'tab': {'x0': round((tab['x0'] - x0) * S, 4), 'cy': round((tcy - y0) * S, 4), 'len': round((tab['x1'] - tab['x0']) * S, 4), 'h': round((tab['y1'] - tab['y0']) * S, 4)}}})
if args.debug:
    cv2.imwrite(os.path.join(OUT, f'{args.mid_name}-mask.png'), np.dstack([inside * 255, art * 255, line * 255]).astype(np.uint8))
