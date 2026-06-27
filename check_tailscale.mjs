import { chromium } from '@playwright/test';

// Tailscale IP でテスト（実際のモバイルと同じURL）
const TARGET = 'http://100.119.65.19:3000';

const browser = await chromium.launch({ headless: true });
const errors = [];

// モバイル Chrome UA
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});
const page = await context.newPage();

page.on('pageerror', e => errors.push(`JS: ${e.message}`));
page.on('response', r => {
  if (!r.ok() && r.url().includes('/api/')) {
    errors.push(`API ${r.status()}: ${r.url()}`);
  }
});
page.on('requestfailed', r => errors.push(`FAIL: ${r.url()} — ${r.failure()?.errorText}`));

// 候補タブから開く
await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);

// チャートタブへ
await page.locator(`a[href="?tab=charts"]`).click();
await page.waitForTimeout(5000);

const canvas = await page.locator('canvas').count();
const loading = await page.locator('text=読み込み中').count();
await page.screenshot({ path: '/tmp/tailscale_charts.png' });
console.log(`[チャート] canvas=${canvas}, 読み込み中=${loading}`);

// ペーパートレードタブへ
await page.locator(`a[href="?tab=paper"]`).click();
await page.waitForTimeout(4000);

const paperContent = await page.locator('text=総資産').count();
await page.screenshot({ path: '/tmp/tailscale_paper.png' });
console.log(`[ペーパートレード] 総資産テキスト=${paperContent}`);

// ネットワークリクエスト状況
const networkLogs = await page.evaluate(() => {
  return performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/api/'))
    .map(r => ({ url: r.name, duration: Math.round(r.duration), status: r.responseStatus ?? '?' }));
});
console.log('\n[APIリクエスト]');
networkLogs.forEach(r => console.log(`  ${r.status} ${Math.round(r.duration)}ms ${r.url}`));

console.log('\n[エラー]', errors.length ? errors : 'なし');
await browser.close();
