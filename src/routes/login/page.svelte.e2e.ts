import { expect, test } from '@playwright/test';

test('the front page is the pitch, not a redirect to the sign-in form', async ({ page }) => {
	// It used to redirect. Asking a stranger to commit before they know what
	// this is was the shortest possible funnel and the wrong one; every *other*
	// route still sends them here.
	await page.goto('/');
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: /run it yourself/i })).toBeVisible();
});

test('but every other route still redirects to /login', async ({ page }) => {
	await page.goto('/goals');
	await expect(page).toHaveURL('/login');
});

test('login page renders sign in form', async ({ page }) => {
	await page.goto('/login');
	await expect(page.locator('h1')).toHaveText('ontoplano');
	await expect(page.locator('input[name="email"]')).toBeVisible();
	await expect(page.locator('input[name="password"]')).toBeVisible();
	await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');
});

test('can toggle between login and register modes', async ({ page }) => {
	await page.goto('/login');
	await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');

	await page.getByText('Register').click();
	await expect(page.locator('button[type="submit"]')).toHaveText('Create account');
	await expect(page.locator('input[name="name"]')).toBeVisible();

	await page.getByText('Sign in').click();
	await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');
});

test('shows error on invalid login', async ({ page }) => {
	await page.goto('/login');
	await page.locator('input[name="email"]').fill('nonexistent@test.com');
	await page.locator('input[name="password"]').fill('wrongpassword');
	await page.locator('button[type="submit"]').click();

	await expect(page.locator('.text-red-700, .bg-red-50')).toBeVisible();
});

test('protects /activities route', async ({ page }) => {
	await page.goto('/activities');
	await expect(page).toHaveURL('/login');
});

test('protects /planner route', async ({ page }) => {
	await page.goto('/planner');
	await expect(page).toHaveURL('/login');
});
