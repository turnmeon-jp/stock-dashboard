import { chromium } from '@playwright/test';

const TARGET = 'http://100.119.65.19:3000';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
});
const page = await context.newPage();

// 全リクエストを記録
const requests = [];
const responses = [];
page.on('request', r => requests.push({ url: r.url(), method: r.method() }));
page.on('response', r => responses.push({ url: r.url(), status: r.status() }));
page.on('requestfailed', r => console.log('FAIL:', r.url(), r.failure()?.errorText));

await page.goto(`${TARGET}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);

// チャートタブへ移動
await page.locator('a[href="?tab=charts"]').click();
await page.waitForTimeout(2000);

// ページ内から直接 fetch テスト
const fetchTest = await page.evaluate(async () => {
  try {
    const r = await fetch('/api/charts', { cache: 'no-store' });
    const text = await r.text();
    return { status: r.status, ok: r.ok, bodyStart: text.slice(0, 100) };
  } catch(e) { return { error: e.message }; }
});
console.log('fetch("/api/charts") from browser:', JSON.stringify(fetchTest));

// ChartGridコンポーネントのstateを確認
await page.waitForTimeout(3000);
const canvas = await page.locator('canvas').count();
const loadingText = await page.locator('text=読み込み中').count();
console.log(`canvas=${canvas}, 読み込み中=${loadingText}`);

// APIエンドポイントのリクエスト一覧
const apiReqs = requests.filter(r => r.url.includes('/api/'));
console.log('\nAPI requests:', apiReqs.length ? apiReqs : '(none)');
const apiRes = responses.filter(r => r.url.includes('/api/'));
console.log('API responses:', apiRes.length ? apiRes : '(none)');

await browser.close();
