import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The box saying it is alive.
 *
 * Deliberately not authenticated: whatever is watching this is not logged in,
 * and it has to work when everything else is broken.
 */
test('/healthz answers without a session and touches the database', async ({ request }) => {
	const res = await request.get('/healthz');

	expect(res.status()).toBe(200);
	expect(res.headers()['cache-control']).toContain('no-store');

	const body = await res.json();
	expect(body.ok).toBe(true);
	expect(body.database).toBe('ok');
	// A number, so a watcher can tell a restart from a long uptime.
	expect(typeof body.uptimeSeconds).toBe('number');
});

test('an error page says what happened and offers a way back', async ({ page }) => {
	// Signed out, an unknown path is sent to the sign-in page rather than to a
	// 404 — so the error page needs a session to be reached at all.
	await register(page, `error-page-${Date.now()}@test.invalid`);

	const res = await page.goto('/this-route-does-not-exist');
	expect(res?.status()).toBe(404);

	await expect(page.getByText('404')).toBeVisible();
	await expect(page.getByRole('link', { name: /back to today/i })).toBeVisible();
});
