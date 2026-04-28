import { test, expect } from '@playwright/test';

interface TestResults {
  passed: number;
  failed: number;
  total: number;
  results: { name: string; pass: boolean }[];
}

test('228 unit tests pass', async ({ page }) => {
  await page.goto('/test/mepto-unit.html');

  const handle = await page.waitForFunction(
    () => {
      const r = (window as unknown as { meptoTestResults?: TestResults }).meptoTestResults;
      return r && r.total > 0 ? r : undefined;
    },
    { timeout: 15000 },
  );

  const data = (await handle.jsonValue()) as TestResults;
  const failures = data.results.filter((r) => !r.pass).map((r) => r.name);

  expect(failures, `Failed tests:\n${failures.join('\n')}`).toHaveLength(0);
  expect(data.passed).toBe(228);
});
