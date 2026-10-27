import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 會放在 /goods-studio/ 底下；本機或其他主機可用 BASE_PATH 覆寫，
// 或用 `vite build --base ./` 產生可從任何靜態主機打開的版本。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/goods-studio/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
} as any);
