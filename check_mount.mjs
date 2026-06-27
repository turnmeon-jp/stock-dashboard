import { chromium } from '@playwright/test';

const TARGET = 'http://100.119.65.19:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 375, height: 812 });

await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(1000);

// チャートタブをクリック
await page.locator('a[href="?tab=charts"]').click();
await page.waitForTimeout(5000);

// DOM状態を詳しく調査
const domState = await page.evaluate(() => {
  const allDivs = Array.from(document.querySelectorAll('[style*="display"]'));
  const displayStates = allDivs.map(d => ({
    display: d.style.display,
    firstText: d.textContent?.trim().slice(0, 50),
    childCount: d.childElementCount,
  })).filter(d => d.firstText);

  // ChartGrid が生成するテキストを探す
  const allText = document.body.innerText;
  const hasChartGrid = allText.includes('チャート一覧を読み込み中') || 
                       allText.includes('検証エッジ適合のみ') ||
                       allText.includes('読み込み中');
  
  // 現在のURL
  const url = window.location.href;
  
  // mounted Set の状態を間接的に確認（displayスタイルを持つ要素数）
  const displayNoneCount = document.querySelectorAll('[style="display: none;"]').length;
  const displayBlockCount = document.querySelectorAll('[style="display: block;"]').length;
  
  return { 
    url, 
    hasChartGrid, 
    allText: allText.slice(0, 500),
    displayNoneCount,
    displayBlockCount,
    displayStates: displayStates.slice(0, 10),
  };
});

console.log('URL:', domState.url);
console.log('ChartGrid関連テキストあり:', domState.hasChartGrid);
console.log('display:none要素数:', domState.displayNoneCount);
console.log('display:block要素数:', domState.displayBlockCount);
console.log('\n表示中テキスト:\n', domState.allText);
console.log('\nDisplay状態:', JSON.stringify(domState.displayStates, null, 2));

await browser.close();
