import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Playwright 要用的 Chrome。
 * 設環境變數 CHROME 為執行檔的絕對路徑即可覆寫自動搜尋。
 */
export function chromeExecutable() {
  const fromEnv = process.env.CHROME;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`CHROME 指向的檔案不存在：${fromEnv}`);
    return fromEnv;
  }
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch {
      /* 下一個 */
    }
  }
  throw new Error('找不到 Chrome。請設定環境變數 CHROME。');
}

export const chromeArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
