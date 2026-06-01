import { test, expect } from '@playwright/test';

// The app redirects unauthenticated users to /(auth) — the onboarding splash.
// These tests verify that core auth screens render and behave correctly against
// the exported web bundle (no backend session, Supabase returns null).

test.describe('Onboarding splash', () => {
  test('shows tagline and CTA buttons', async ({ page }) => {
    await page.goto('/');

    // Wait for the React app to mount and auth redirect to settle
    await expect(page.getByText('Retire Early. Live Free.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Get Started')).toBeVisible();
    await expect(page.getByText('Log In')).toBeVisible();
  });
});

test.describe('Login screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Retire Early. Live Free.')).toBeVisible({ timeout: 20_000 });
    // "Log In" appears inside "Already have an account? Log In"
    await page.getByText('Already have an account?').click();
    await expect(page.getByText('Welcome back!')).toBeVisible({ timeout: 10_000 });
  });

  test('renders email and password fields', async ({ page }) => {
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByText('Continue with Google')).toBeVisible();
  });

  // Zod v4 only fires custom messages when the value IS a string that fails the rule;
  // undefined fields get "Invalid input: expected string, received undefined".
  // Fill invalid-but-string values so the human-readable custom messages appear.
  test('shows validation errors for bad input', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('notanemail');
    await page.getByPlaceholder('Enter your password').fill('12');

    // "Log In  →" button — getByText does a substring match, .last() gets the button
    await page.getByText('Log In').last().click();

    await expect(page.getByText('Enter a valid email')).toBeVisible();
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
  });

  test('navigates to signup screen', async ({ page }) => {
    await page.getByText('Sign Up').click();

    // Use subtitle and the name field — both are unique to the signup screen.
    // Avoid asserting `you@example.com` here: Expo Router Stack keeps both
    // screens in the DOM so two inputs with that placeholder exist simultaneously.
    await expect(page.getByText('Join thousands on their FIRE journey')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
  });
});

test.describe('Signup screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Retire Early. Live Free.')).toBeVisible({ timeout: 20_000 });
    await page.getByText('Already have an account?').click();
    await expect(page.getByText('Welcome back!')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Sign Up').click();
    // Unique subtitle — avoids strict-mode ambiguity between heading and submit button
    await expect(page.getByText('Join thousands on their FIRE journey')).toBeVisible({ timeout: 10_000 });
  });

  test('renders all form fields', async ({ page }) => {
    // Use placeholders that only exist on the signup screen to avoid strict-mode
    // violations caused by the Stack keeping the login screen in the DOM.
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
    await expect(page.getByPlaceholder('At least 8 characters')).toBeVisible();
    await expect(page.getByPlaceholder('Re-enter password')).toBeVisible();
  });

  test('shows validation error for short name', async ({ page }) => {
    // The submit button has `disabled={!agreed}` — it ignores clicks until the
    // Terms checkbox is checked. "I agree to " is a Text with onPress={setAgreed}.
    await page.getByText('I agree to').click();

    // Fill a name that is too short (< 2 chars) to hit the custom Zod message.
    await page.getByPlaceholder('John Doe').fill('A');

    // Button is now enabled — click it to trigger form validation.
    await page.getByText('Create Account →').click();

    await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
  });
});
