import { expect, test } from '@playwright/test';

/**
 * The public endpoint the site's footer form posts to.
 *
 * The e2e instance keeps no list — `[newsletter] enabled` is false, which is
 * the default and what every self-hosted install runs — so what this holds is
 * the shape of the refusal. An instance that does not want a mailing list must
 * not advertise an endpoint for one, and must not answer a CORS preflight for
 * an origin it has never heard of.
 */
test('an instance with no list does not advertise one', async ({ request }) => {
	const post = await request.post('/api/subscribe', { data: { email: 'a@test.invalid' } });
	expect(post.status()).toBe(404);

	const preflight = await request.fetch('/api/subscribe', {
		method: 'OPTIONS',
		headers: { origin: 'https://somewhere.test' }
	});
	expect(preflight.status()).toBe(404);
});

test('the confirm and unsubscribe pages are not a way past the login', async ({ page }) => {
	for (const path of ['/newsletter/confirm?t=made-up', '/newsletter/off?t=made-up']) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(404);
		// A 404, not a redirect: these routes sit outside the session gate on
		// purpose, and a redirect here would mean the gate had swallowed them.
		expect(new URL(page.url()).pathname).not.toBe('/login');
	}
});
