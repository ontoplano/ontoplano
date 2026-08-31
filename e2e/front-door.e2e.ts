import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * What a stranger sees at `/`.
 *
 * This used to be the pitch — headline, price, video, the argument for
 * self-hosting. That page is ontoplano.com now, a repository and an audience of
 * its own, and what is left here is a door: the name, one line, and a way in.
 *
 * The reason is that most instances are not the hosted one. Anybody may run
 * this, and on their machine a pitch would be absurd — they installed it, they
 * are not being sold anything. So what is asserted here is that the door works
 * and that nothing is being sold through it.
 */
test('the front page is a door when signed out', async ({ page }) => {
	await page.goto('/', { waitUntil: 'networkidle' });

	// Not a redirect to the sign-in form: a stranger should learn what this is.
	expect(new URL(page.url()).pathname).toBe('/');

	await expect(page.getByRole('heading', { level: 1 })).toContainText(/ontoplano/i);
	await expect(page.getByText(/a planner for a whole week/i)).toBeVisible();

	// The way in. Registration is open on the test instance, so both are here.
	await expect(page.getByRole('link', { name: /create an account/i })).toBeVisible();
	await expect(page.getByRole('link', { name: /^sign in$/i })).toBeVisible();
});

test("and it sells nothing — most instances are somebody else's to run", async ({ page }) => {
	await page.goto('/', { waitUntil: 'networkidle' });

	// A price on a self-hosted instance is a bill somebody is not being sent.
	// If one reappears here, the marketing site has leaked back into the app.
	await expect(page.getByText(/\/month/)).toHaveCount(0);
	await expect(page.getByText(/billed yearly/i)).toHaveCount(0);
	await expect(page.getByText(/free trial/i)).toHaveCount(0);
});

test('and the dashboard the moment somebody is signed in', async ({ page }) => {
	await register(page, `front-door-${Date.now()}@test.invalid`);
	await page.goto('/', { waitUntil: 'networkidle' });

	await expect(page.getByText(/a planner for a whole week/i)).toHaveCount(0);
	await expect(page.getByRole('button', { name: /arrange/i })).toBeVisible();
});
