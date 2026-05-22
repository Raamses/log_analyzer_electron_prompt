import { test, expect } from '@playwright/test';

test('Dashboard loads and displays data', async ({ page }) => {
  await page.goto('http://localhost:4173');

  // Check for the main heading
  await expect(page.locator('h1')).toContainText('Log Analyzer Dashboard');

  // Upload a log file
  await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample.log');

  // Wait for the file to be processed and analytics to be displayed
  await expect(page.locator('text="Successfully parsed 4 log entries."')).toBeVisible();

  // Check that the summary cards are rendered
  await expect(page.locator('div[class*="bg-gray-800/50"]').filter({ hasText: 'Total Requests' }).locator('p.text-white')).toContainText('4');

  // Check that the charts are rendered
  await expect(page.locator('h3:has-text("Request Throughput")')).toBeVisible();
  await expect(page.locator('h3:has-text("Status Code Distribution")')).toBeVisible();

  // Check that the log viewer is rendered
  await expect(page.locator('h2:has-text("Log Viewer")')).toBeVisible();
  await expect(page.locator('.log-entry')).toHaveCount(4);

  // Take a screenshot for visual verification
  await page.screenshot({ path: '/home/jules/verification/verification.png', fullPage: true });
});
