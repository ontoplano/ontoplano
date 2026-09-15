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

test('the unsubscribe page is not a way past the login', async ({ page }) => {
	// There is no confirm page any longer: pressing the button subscribes, so
	// the only link a message carries is the way back out.
	const response = await page.goto('/newsletter/off?t=made-up');
	expect(response?.status()).toBe(404);
	// A 404, not a redirect: this route sits outside the session gate on
	// purpose, and a redirect here would mean the gate had swallowed it.
	expect(new URL(page.url()).pathname).not.toBe('/login');
});
