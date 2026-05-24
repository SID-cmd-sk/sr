'use strict';
const { test, expect } = require('@playwright/test');

test.describe('Activities page smoke test', () => {
  test('should login and render activities page without console errors', async ({ page }) => {
    const baseUrl = 'http://localhost:8000';
    const email = 'sidharth.kumar@sks3d.com';
    const password = 'Tanvi123@sks';
    const consoleErrors = [];
    const requestFailures = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });
    page.on('requestfailed', request => {
      requestFailures.push(`${request.url()} ${request.failure()?.errorText || ''}`);
    });

    await page.goto(`${baseUrl}/app.html#activities`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem(Object.keys(localStorage).find(k => k.startsWith('sb-') && k.includes('auth-token'))));
    await page.reload({ waitUntil: 'networkidle' });

    if (await page.locator('#auth-screen:not(.hidden)').count() > 0) {
      await expect(page.locator('#login-email')).toBeVisible({ timeout: 10000 });
      await page.fill('#login-email', email);
      await page.fill('#login-pass', password);
      await page.click('#login-btn');
    }

    await expect(page.locator('#app-shell')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#page-content')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.page-title')).toHaveText('Activities', { timeout: 20000 });

    const pageText = await page.textContent('#page-content');
    expect(pageText).not.toContain('Could not load activities');

    expect(consoleErrors).toEqual([]);
    expect(requestFailures).toEqual([]);

    const rowCount = await page.locator('table.data-table tbody tr').count();
    console.log('Activities rows:', rowCount);
  });
});
