const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  let navCount = 0;
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      navCount++;
      console.log('NAVIGATED #' + navCount + ': ' + frame.url());
    }
  });
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('RESULTS')) console.log('CONSOLE RESULTS:', text);
  });
  
  console.log('Navigating...');
  await page.goto('http://localhost:3000/test/e2e/event-tests.html', { timeout: 10000, waitUntil: 'load' });
  console.log('Loaded. Waiting 3s...');
  
  await page.waitForTimeout(3000);
  console.log('Wait done. Navigations:', navCount);
  
  const results = await page.evaluate(() => window.meptoTestResults);
  console.log('Results:', JSON.stringify(results));
  
  await browser.close();
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});

// Hard timeout
setTimeout(() => {
  console.error('HARD TIMEOUT');
  process.exit(1);
}, 15000);
