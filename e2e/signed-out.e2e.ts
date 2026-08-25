import { expect, test } from '@playwright/test';

/**
 * What a signed-out write gets.
 *
 * The signed-out check lives in the root layout's load, and a load does not run
 * for a form action — so every action used to reach `locals.user!.id` with
 * nothing there and answer "Unexpected error". A page left open overnight is
 * the ordinary way to meet this, and the honest answer is the login page.
 */

const ORIGIN = 'http://localhost:4173';

test('a form action posted without a session redirects to the login page', async ({
	playwright
}) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });

	const res = await request.post('/diary/notebooks?/create', {
		headers: { Origin: ORIGIN, 'x-sveltekit-action': 'true' },
		form: { title: 'written by nobody' },
		maxRedirects: 0
	});

	expect(res.status()).toBe(200);
	expect(await res.json()).toMatchObject({ type: 'redirect', location: '/login' });

	await request.dispose();
});

test('a plain form submit without a session redirects to the login page', async ({
	playwright
}) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });

	const res = await request.post('/planner/todo?/create', {
		headers: { Origin: ORIGIN, Accept: 'text/html' },
		form: { title: 'written by nobody' },
		maxRedirects: 0
	});

	expect(res.status()).toBe(303);
	expect(res.headers()['location']).toBe('/login');

	await request.dispose();
});

test('signing in is still possible while signed out', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });

	// The guard must not swallow the one write a signed-out visitor has to make.
	const res = await request.post('/api/auth/sign-in/email', {
		headers: { Origin: ORIGIN },
		data: { email: 'nobody@example.test', password: 'wrongwrongwrong' },
		maxRedirects: 0
	});

	expect(res.status(), 'reached better-auth rather than the redirect').toBe(401);

	await request.dispose();
});
