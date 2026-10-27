# 周邊設計工具 Goods Studio

在瀏覽器裡設計周邊：卡片、拍立得、明信片、書籤、色板、⌀58mm 徽章、壓克力立牌和吊飾。
每個品項都有實際的 mm 尺寸、出血和安全區。燙金和雷射膜可以在 3D 裡打光、轉著看，最後匯出印刷檔。

不需要登入，也沒有後端。作品存在這台裝置瀏覽器的 IndexedDB 裡。

## 功能（v0.1）

- **品項模板**：卡片 100×148、拍立得 54×86、明信片 148×100、書籤 50×150、色板 135×135、徽章 ⌀58、壓克力立牌、壓克力吊飾。出血預設 3mm，安全區預設 3mm，都可以調整。
- **編輯器**
  - 圖片（上傳或拖進畫布）、文字、矩形、圓形、星形、愛心。
  - 可以選取、移動、縮放和旋轉圖層。
  - 縮放和平移：Ctrl＋滾輪縮放，滾輪或拖曳空白處平移，手機用雙指。
- **工藝分組圖層**：印刷、燙金／膜、白墨、刀模。把圖層拖到哪一組，就套用哪種工藝。圖層可以隱藏、鎖定、刪除和排序。
- **復原／重做**：Ctrl+Z、Ctrl+Shift+Z（或 Ctrl+Y）。
- **快捷鍵**：Delete 刪除、Ctrl+D 複製、方向鍵微調（加 Shift 一次移 5mm）、T 加入文字。
- **自動儲存**：首頁有作品清單，可以搜尋、排序、重新命名、複製和刪除。
- **壓克力**
  - 依圖稿的透明度自動產生外框，外擴距離可以調。
  - 吊飾會自動加掛孔，立牌會自動加插腳和底座。
- **3D 預覽**（three.js 加上自己寫的 shader）
  - 8 種膜材：亮金、玫瑰金、亮銀、古銅金、霧黑、彩虹雷射、亮片雷射、碎玻璃雷射。
  - 光源可以拖曳光球，或用光源盤調整。
  - 可以旋轉和縮放視角。手機上能用陀螺儀傾斜看反光，iOS 會先跳出授權按鈕。
- **匯出**
  - 300dpi 透明 PNG（也可以選 150 或 600dpi），PNG 內含 DPI 資訊。
  - 完稿預覽。
  - 黑白遮罩：燙金（多種膜材時會另外分開輸出）和白墨。
  - 刀模線，PNG 和 mm 單位的 SVG 各一份。
  - 可以一次打包成 ZIP。
  - 3D 預覽可以錄 6 秒的 1080×1080 旋轉影片。瀏覽器支援就存 MP4，不支援就存 WebM。

## 開發

```bash
npm install
npm run dev          # 開發伺服器
npm test             # 單元測試（vitest：單位換算、出血／安全區、外框偏移）
npm run build        # 型別檢查＋正式版（base 預設 /goods-studio/，給 GitHub Pages）
npm run build:static # base './' 版本，輸出到 dist-static/，放到任何靜態主機的任何路徑都能開
npm run preview      # 在 4173 埠預覽 dist/
node scripts/screenshots.mjs  # 產生預覽截圖（需要 Chrome）
node scripts/smoke.mjs        # 功能冒煙測試
```

`BASE_PATH` 環境變數可以覆寫 Vite 的 `base`。

路由用 hash（`#/p/<id>`），所以 GitHub Pages 不需要 404 轉址。

## 部署到 GitHub Pages

1. 把專案推到 GitHub repo `goods-studio` 的 `main` 分支。
2. 到 repo 的 Settings → Pages → Build and deployment，把 Source 選成 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 會自動跑測試、建置並部署。網址是 `https://<帳號>.github.io/goods-studio/`。

之後要接自訂網域時：

1. 在 `public/` 放一個 `CNAME` 檔，內容是網域。
2. 把 workflow 裡的 `BASE_PATH` 改成 `/`。
3. 在 DNS 加一筆指向 `<帳號>.github.io` 的 CNAME 記錄。

## 換品牌

顏色、圓角和字型都集中在 `src/styles/theme.css`。Logo 在首頁頂欄（`src/components/Home.tsx` 的 `.brand`）和 `public/favicon.svg`。

## 版權與授權

- 程式碼、shader、圖示、範例圖稿（小糰子、夜空、月亮）都是本專案自己寫或畫的。範例圖稿是程式裡的 SVG。
- 參考網站只用來了解功能與流程，沒有使用它的任何程式碼、素材或字型。
- 沒有打包任何字型，介面使用系統內建字型。

使用的套件：

| 套件 | 授權 |
| --- | --- |
| react, react-dom | MIT |
| konva, react-konva | MIT |
| three | MIT |
| fflate | MIT |
| idb-keyval | Apache-2.0 |
| vite, @vitejs/plugin-react, vitest | MIT（僅開發用） |
| typescript, playwright-core | Apache-2.0（僅開發用） |
