import { test, expect } from '@playwright/test';

test('event page loads', async ({ page }) => {
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  
  const response = await page.goto('/test/e2e/event-tests.html', { timeout: 30000, waitUntil: 'load' });
  console.log('Response status:', response?.status());
  
  await page.waitForTimeout(3000);
  
  const summary = await page.locator('#summary').count();
  console.log('Summary found:', summary);
  
  const html = await page.content();
  console.log('HTML length:', html.length);
});
