import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'ganesh.ravi.ly@gmail.com';
const PASSWORD = 'StrongPassword';
const DIR = 'docs/demo';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120_000);

async function snap(page: Page, name: string) {
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${DIR}/${name}` });
}

test('01 splash', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Retire Early. Live Free.')).toBeVisible({ timeout: 20_000 });
  await snap(page, '01-splash.png');
});

test('02 login screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Retire Early. Live Free.')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Already have an account?').click();
  await expect(page.getByText('Welcome back!')).toBeVisible({ timeout: 10_000 });
  await snap(page, '02-login.png');
});

test('03 signup screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Retire Early. Live Free.')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Already have an account?').click();
  await expect(page.getByText('Welcome back!')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Sign Up').click();
  await expect(page.getByText('Join thousands on their FIRE journey')).toBeVisible({ timeout: 10_000 });
  await snap(page, '03-signup.png');
});

test('authenticated screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Retire Early. Live Free.')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Already have an account?').click();
  await expect(page.getByText('Welcome back!')).toBeVisible({ timeout: 10_000 });

  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  page.on('dialog', (d) => d.dismiss());
  await page.getByText('Log In').last().click();

  // Root layout redirects /(auth)/login → /(tabs)/ (URL becomes '/') on SIGNED_IN
  await page.waitForURL('http://localhost:3000/', { timeout: 30_000 });
  await page.waitForTimeout(4000);
  await snap(page, '04-home.png');

  await page.getByRole('tab', { name: /fire/i }).click();
  await page.waitForTimeout(2500);
  await snap(page, '05-fire-calculator.png');

  await page.getByRole('tab', { name: /insights/i }).click();
  await page.waitForTimeout(2500);
  await snap(page, '06-spend-insights.png');

  await page.getByRole('tab', { name: /tasks/i }).click();
  await page.waitForTimeout(2500);
  await snap(page, '07-tasks.png');

  await page.getByRole('tab', { name: /advisor/i }).click();
  await page.waitForTimeout(2500);
  await snap(page, '08-advisor.png');

  await page.getByRole('tab', { name: /profile/i }).click();
  await page.waitForTimeout(2500);
  await snap(page, '09-profile.png');
});
