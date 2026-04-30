const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text().substring(0, 100)));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  
  console.log('Navigating...');
  const response = await page.goto('http://localhost:3000/test/e2e/event-tests.html', { timeout: 10000, waitUntil: 'load' });
  console.log('Response status:', response?.status());
  
  await page.waitForTimeout(2000);
  
  const summary = await page.locator('#summary').count();
  console.log('Summary found:', summary);
  
  const results = await page.evaluate(() => window.meptoTestResults);
  console.log('Results:', JSON.stringify(results, null, 2));
  
  await browser.close();
})();
