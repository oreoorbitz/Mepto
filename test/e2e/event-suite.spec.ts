import { test, expect } from '@playwright/test';

interface TestResults {
  passed: number;
  failed: number;
  total: number;
  results: { name: string; pass: boolean }[];
}

test('event tests pass', async ({ page }) => {
  await page.goto('/test/e2e/event-tests.html', { waitUntil: 'domcontentloaded' });

  // #summary gets class "pass" or "fail" when the suite finishes
  await page.locator('#summary.pass, #summary.fail').waitFor({ timeout: 15000 });

  const data = await page.evaluate(
    () => (window as unknown as { meptoTestResults: TestResults }).meptoTestResults,
  );

  const failures = data.results.filter((r) => !r.pass).map((r) => r.name);
  expect(failures, `Failed tests:\n${failures.join('\n')}`).toHaveLength(0);
  expect(data.failed).toBe(0);
});
