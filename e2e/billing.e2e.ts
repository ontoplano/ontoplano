import { expect, test } from '@playwright/test';
import { clientAddress } from './helpers/account';

/**
 * Billing, on an instance that sells nothing.
 *
 * The suite runs with `ONTOPLANO_SELF_HOST=true`, which is the deployment that
 * has no plans, no ceilings and no provider — so this locks in the shape of
 * that answer. The provider's own logic (signatures, exactly-once webhooks) is
 * exercised against a configured instance in `scripts/check-billing.ts`.
 */

const ORIGIN = 'http://localhost:4173';

test('a self-hosted instance has no payment provider to talk to', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });

	const hook = await request.post('/api/billing/lemonsqueezy', {
		headers: { Origin: ORIGIN },
		data: { meta: { event_name: 'subscription_created' } }
	});

	// Not 401: an instance that sells nothing does not have a webhook endpoint
	// at all, and saying "bad signature" would imply it does.
	expect(hook.status()).toBe(404);

	await request.dispose();
});

test('a self-hosted instance has no billing page at all', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `bill-${Date.now()}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: 'hunter2hunter2', name: 'Bill' }
	});
	expect(signUp.ok(), await signUp.text()).toBeTruthy();

	const cookie = (
		signUp.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	await request.post('/welcome', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { timezone: 'America/Sao_Paulo', firstDay: '0', generateDay: '6', template: 'blank' }
	});

	/*
	 * Not a page saying "nothing to pay" — no page. Somebody running this on
	 * their own machine who is shown a billing screen has just been told the
	 * free version is a demo, and it is not: it is the whole thing.
	 */
	const page = await request.get('/settings/billing', { headers: { Cookie: cookie } });
	expect(page.status()).toBe(404);

	// And nothing links to it, so it is not a page you can only reach by URL.
	const settings = await request.get('/settings/account', { headers: { Cookie: cookie } });
	expect(await settings.text()).not.toContain('/settings/billing');

	await request.dispose();
});
