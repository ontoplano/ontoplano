import { expect, test, type Page } from '@playwright/test';

/**
 * Open `/login` in the mode this test means to look at.
 *
 * The page opens on **register** when the instance has no accounts yet (there
 * is nobody to sign in as) or when it is inviting registration — so the three
 * tests below that read the sign-in form used to pass in a full run, where an
 * earlier spec had already made an account, and fail when this file ran on its
 * own. A test that means to look at the sign-in form has to ask for it rather
 * than inherit it from whatever ran before.
 *
 * The toggle back is the "Have an account? Sign in" link under the form, which
 * is not the submit button — hence the paragraph-scoped locator.
 *
 * It waits for hydration before it returns, and that is not belt-and-braces:
 * the mode toggle is a client handler, so a test that clicks it against
 * server-rendered HTML clicks nothing and reads the mode it started in. That
 * only ever showed up in a full run — on its own this file opens in register
 * mode, and the toggle back below happens to wait for hydration on the way
 * past.
 */
async function openSignIn(page: Page) {
	await page.goto('/login');
	await page.waitForSelector('html[data-ready]', { timeout: 20_000 });
	const submit = page.locator('button[type="submit"]');
	if ((await submit.innerText()) !== 'Sign in') {
		await page.locator('p', { hasText: 'Have an account?' }).getByRole('button').click();
	}
	await expect(submit).toHaveText('Sign in');
}

test('the front page is a door, not a redirect to the sign-in form', async ({ page }) => {
	// It used to redirect. Landing a stranger on a password field before they
	// know what this is tells them nothing, and an instance should say its own
	// name; every *other* route still sends them here.
	await page.goto('/');
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: /^sign in$/i })).toBeVisible();
});

test('but every other route still redirects to /login', async ({ page }) => {
	await page.goto('/goals');
	await expect(page).toHaveURL('/login');
});

test('login page renders sign in form', async ({ page }) => {
	await openSignIn(page);
	await expect(page.locator('h1')).toHaveText('ontoplano');
	await expect(page.locator('input[name="email"]')).toBeVisible();
	await expect(page.locator('input[name="password"]')).toBeVisible();
	await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');
});

test('can toggle between login and register modes', async ({ page }) => {
	await openSignIn(page);

	await page.getByText('Register').click();
	await expect(page.locator('button[type="submit"]')).toHaveText('Create account');
	await expect(page.locator('input[name="name"]')).toBeVisible();

	await page.locator('p', { hasText: 'Have an account?' }).getByRole('button').click();
	await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');
});

test('shows error on invalid login', async ({ page }) => {
	await openSignIn(page);
	await page.locator('input[name="email"]').fill('nonexistent@test.com');
	await page.locator('input[name="password"]').fill('wrongpassword');
	await page.locator('button[type="submit"]').click();

	await expect(page.getByRole('alert')).toBeVisible();
	await expect(page.getByRole('alert')).toContainText(/invalid/i);
});

test('protects /activities route', async ({ page }) => {
	await page.goto('/activities');
	await expect(page).toHaveURL('/login');
});

test('protects /tasks route', async ({ page }) => {
	await page.goto('/tasks');
	await expect(page).toHaveURL('/login');
});
