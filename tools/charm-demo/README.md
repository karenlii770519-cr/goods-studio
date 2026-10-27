# 壓克力吊飾 3D 示範工具

這組腳本獨立於編輯器。它們讀取刀模與貼圖，組成一個可以離線打開的 three.js 頁面，用來看真實厚度的壓克力、磁鐵、開口圈和擺動。

圖檔只透過路徑讀入。請不要把 `art.png`、`white.png`、`cut.png`、PDF，或任何客戶圖稿提交進這個 repo。建出來的 HTML 會把圖片嵌成 data URI，也不要提交。

兩個版本都留著：

| 路徑 | 內容 |
| --- | --- |
| `build/` | 單件：磁鐵上片 + 開口圈 + 下片吊飾 |
| `set3/build/` | 三層組：磁鐵卡片（有插槽）+ 插片中片 + 開口圈 + 下片吊飾 |

## 每個檔案在做什麼

`lib/chrome.mjs` 找出 headless 截圖要用的 Chrome。用環境變數 `CHROME` 指定執行檔。

### 單件 `build/`

- `entry.ts`：場景、壓克力、磁鐵、開口圈、鐘擺，以及截圖用的 `__renderAt` / `__minZ`。
- `build.mjs`：用 esbuild 把 `entry.ts` 包進 `template.html`，並把零件資料嵌進去。
- `template.html`：空白頁面。`__INFO__`、`__DATA__`、`__SCRIPT__` 由 `build.mjs` 換掉。
- `shot.mjs`：打開建好的 HTML，在指定秒數截 PNG。
- `video.mjs`：逐格渲染 6 秒、30fps 的 PNG，給 ffmpeg 編碼。
- `ui.mjs`：等場景就緒後拖一下滑鼠再截圖，用來確認軌道控制還能轉。

### 三層組 `set3/build/`

- `entry.ts`：卡片插槽、中片插片、開口圈與下片。撞牆檢查是 `__minWallZ`。
- `build.mjs`、`template.html`、`shot.mjs`、`video.mjs`、`ui.mjs`：同上。影片是 8 秒。
- `trace.py`：從一張固定版面的設計總表描出卡片與中片的刀模、彩圖和白墨。像素座標寫在腳本裡，換版面要改座標。下片要另外準備資料夾。

## 輸入格式

每個零件一個資料夾，單位是 **mm**。設計座標的原點在左上角，**y 向下**。

| 檔案 | 是否必填 | 內容 |
| --- | --- | --- |
| `cut.json` | 必填 | 刀模與掛孔 |
| `art.png` | 可省略 | 彩色印刷。單件若省略，會用內縮的白底代替 |
| `white.png` | 可省略 | 白墨。用透明度表示有墨的地方；建置時會把 RGB 刷成近白色 |

`cut.json` 最少要有：

```json
{
  "outer": [[0, 0], [30, 0], [30, 40], [0, 40]],
  "hole": { "cx": 15, "cy": 3, "r": 1.25 },
  "centroid": [15, 22],
  "texture": { "dpi": 300, "origin_mm": [0, 0] }
}
```

- `outer`：刀模外框，依序圍一圈。
- `hole`：掛孔圓心與半徑。單件用它當吊點。
- `centroid`：有的話，下片會先轉一個角度，讓重心落在掛點正下方。
- `texture.dpi`：貼圖解析度。1 px = `25.4 / dpi` mm。
- `texture.origin_mm`：貼圖左上角在設計座標的位置。貼圖寬高 = 圖片像素 × 每像素的 mm。

三層組另外可以有：

- `circles`：多個圓孔。沒寫時用 `hole`。
- `polyHoles`：多邊形孔，插槽就是這種孔。
- `mount.slot`：卡片插槽，`{ cx, cy, w, h }`。卡片必填。
- `mount.tab`：中片插片，`{ x0, cy, len, h }`。`x0` 是肩線，`len` 是插入方向的長度。中片必填，而且要有 `hole`。

## 怎麼跑

在 repo 根目錄先 `npm ci`。`three`、`playwright-core` 在依賴裡，`esbuild` 會跟著 Vite 裝上。`trace.py` 另外需要 `opencv-python`、`numpy`、`scipy`。

沒有系統 Chrome 時，設定 `CHROME` 為執行檔路徑。

單件：

```bash
node tools/charm-demo/build/build.mjs \
  --piece /path/to/charm --top /path/to/top \
  --out /tmp/charm-3d.html

node tools/charm-demo/build/shot.mjs --html /tmp/charm-3d.html --out /tmp/charm.png --t 0,0.75
node tools/charm-demo/build/video.mjs --html /tmp/charm-3d.html --frames /tmp/charm-frames
node tools/charm-demo/build/ui.mjs file:///tmp/charm-3d.html /tmp/charm-ui.png
```

`--top` 可以省略。省略時上片是 30×18 mm 的圓角片，沒有圖。

三層組：

```bash
node tools/charm-demo/set3/build/build.mjs \
  --card /path/to/card --mid /path/to/mid --bottom /path/to/bottom \
  --out /tmp/set3-3d.html

node tools/charm-demo/set3/build/shot.mjs --html /tmp/set3-3d.html --out /tmp/set3.png --t 0
node tools/charm-demo/set3/build/video.mjs --html /tmp/set3-3d.html --frames /tmp/set3-frames

python tools/charm-demo/set3/build/trace.py --src /path/to/sheet.jpg --out /tmp/traced
```

`--extra '&az=30'` 會加在截圖網址後面。影片格數用 ffmpeg 接起來，例如：

```bash
ffmpeg -y -framerate 30 -i /tmp/charm-frames/f%04d.png -c:v libx264 -pix_fmt yuv420p /tmp/charm.mp4
```

瀏覽器直接打開 HTML 即可拖曳旋轉、滾輪縮放。網址參數：

- `clean`：隱藏左上角標題（截圖用）。
- `capture`：畫布固定 1080×1350，不啟動動畫迴圈，改等 `__renderAt`。
- `az`、`el`：相機方位角與仰角（度）。

## 關鍵做法

### 壓克力材質

板身用 `MeshPhysicalMaterial`：`transmission: 1`、`ior: 1.49`（壓克力）、`thickness` 等於板厚 3 mm，再加一點青綠色的 `attenuationColor`，光走過厚度才會染色。正面材質粗糙度是 0，清漆很輕。側面是另一份材質：`transmission: 0.85`、光學厚度 6 mm、較強的環境反射和一點自發光，切邊才看得出來是厚的。

`ExtrudeGeometry` 的第 0 組材質是上下蓋，第 1 組是側壁，所以 mesh 的材質陣列是 `[正面, 側面]`。幾何深度是 `3 - 倒角×2`，再加倒角，實體厚度約 3 mm。

### 厚度與印刷

印刷不是貼在表面上。彩圖在 `z = -板厚/2 - 0.02`，白墨再往後一點。從正面看，圖在透明體的背面，厚度是真的隔在中間。白墨圖會先把 RGB 刷白，只留原本的透明度。

### 開口圈怎麼掛

開口圈是缺一段的 `TorusGeometry`。主半徑 4 mm（外徑約 9 mm），線半徑 0.5 mm（線徑 1 mm），圓弧少 0.42 弧度，開口才看得到。

單件：上片的原點在掛孔頂端。圈的接點放在孔的下緣，上緣線材穿過孔。牆在 `z = 0`，圈不能平貼，所以往前傾約 15°（`PHI = 0.27`）。圓心是 `(0, -R·cos Φ, R·sin Φ)`，整圈都在牆前面。下片掛在圈的最低點，也就是圓心再往下 `R - 線半徑`。

三層組：中片先繞 Y 轉 90°，板面垂直於牆，插片從卡片正面穿進槽裡。圈的平面與牆平行，上緣穿過中片底部的掛孔。下片用同一個朝向，掛在圈的最低點（接點下方 `2R - 線半徑`）。

磁鐵是直徑 10 mm、厚 2 mm 的圓柱，軸轉向牆。單件貼在上片背面中央。三層組放在插槽上方，避免從槽裡看到磁鐵。卡片中心離牆 `磁鐵厚 + 板厚/2`。

### 擺動

不是剛體模擬。用相位錯開的正弦去轉開口圈和下片，看起來像鐘擺：圈先動，吊飾晚一點跟上。

單件的擺動週期是 1.5 秒，另外用 6 秒轉一圈的慢速扭轉。下片的 X 旋轉只往鏡頭方向（負值），不往牆裡擺。扭轉幅度也小，因為離牆只有約 3 mm。三層組的循環是 8 秒，圈在下片的板面裡前後擺，相機也沿著這 8 秒緩緩繞。

### 撞牆檢查

牆是 `z = 0` 的平面。`__minZ`（單件）和 `__minWallZ`（三層組）會先套用某個時刻的姿勢，再把吊飾每個頂點乘上 `matrixWorld`，取最小的 z。小於 0 就是插進牆裡。擺動幅度是照這個檢查收過的。軌道控制的方位角也限制在牆的前方，鏡頭不會轉到牆後。

### three.js r186 的 envMapIntensity

這個 repo 的 three 是 r186。從 r163 起，`scene.environment` 只是渲染器的後備環境圖，**不會**乘上每個材質的 `envMapIntensity`（整體強度改看 `scene.environmentIntensity`）。牆、金屬、壓克力正面和側面要的反射強度不一樣，所以組完場景後會走一遍 mesh，把 PMREM 產生的 `RoomEnvironment` 貼圖直接設進 `material.envMap`，並 `needsUpdate = true`。這樣 `envMapIntensity`（牆 0.38、金屬 1.4、壓克力正面 0.6、側面 2.4）才會各自生效。
