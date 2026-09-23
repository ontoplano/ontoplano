import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { isDemo } from '$lib/server/settings';
import {
	createDemoAccount,
	demoAccountCount,
	DEMO_ACCOUNTS_PER_ADDRESS,
	DEMO_WINDOW_MS
} from '$lib/server/services/demo';
import { clientKey, rateLimit } from '$lib/server/rate-limit';
import { record as audit } from '$lib/services/audit';

/**
 * The demo's front door.
 *
 * Making a demo account is not free: a row, a password hash, and a week of
 * seeded data written to SQLite. That took a few seconds while the browser
 * showed nothing at all — a white page, then the dashboard — which reads as a
 * slow site rather than as something being built for you.
 *
 * So the wait has a screen. It also has somewhere to go: with the work behind
 * a page the visitor is already looking at, the seed can be made slower under
 * load without anybody experiencing a hang.
 */

/** Where to land afterwards. Same-origin paths only: this is from a URL. */
function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
	// Not back here, or arriving would start the wait again.
	return raw.startsWith('/demo') ? '/' : raw;
}

export const load: PageServerLoad = ({ url, locals }) => {
	if (!isDemo()) error(404, 'Not found');
	const next = safeNext(url.searchParams.get('next'));
	// Already signed in — somebody pressed back, or opened this twice.
	if (locals.user) redirect(303, next);
	return { next };
};

export const actions: Actions = {
	default: async (event) => {
		if (!isDemo()) error(404, 'Not found');
		const form = await event.request.formData();
		const next = safeNext(String(form.get('next') ?? '/'));

		/*
		 * The same budget the hook applies, for the same reason.
		 *
		 * This is an unauthenticated POST that creates an account and runs a
		 * seed — the one place in the app where that is true. Generous for a
		 * person opening the demo a few times, useless to a script doing it in
		 * a loop. Shared with the hook so the two cannot drift apart.
		 */
		// Whose visit this is, as far as anything here knows: there is no
		// account yet, so the address is both the subject and the detail.
		const address = clientKey(event.request, event.getClientAddress);
		const budget = rateLimit(`demo:${address}`, DEMO_ACCOUNTS_PER_ADDRESS, DEMO_WINDOW_MS);
		/*
		 * Two different answers, which were the same answer.
		 *
		 * "You have opened five of these in an hour" and "every copy is in use"
		 * are not the same situation, and both said the second one. So somebody
		 * testing the demo — opening it, looking, closing it, opening it again
		 * — was told the server was full, which is not true, not their fault as
		 * far as the sentence goes, and not something waiting for a free seat
		 * will fix. It says whose limit it is now, and when it lifts.
		 */
		if (!budget.allowed) {
			// Written down with the rule and the room at that moment, so the
			// operator's digest can tell a rate limiter doing its job from a
			// demo that is actually full — the two look identical as a count.
			audit(address, 'demo_refused', {
				detail: { why: 'rate', out: demoAccountCount() },
				ip: address
			});
			return { busy: true, minutes: Math.max(1, Math.ceil(budget.retryAfterSeconds / 60)) };
		}

		const account = await createDemoAccount(event.url.hostname);
		if (!account) {
			// Every seat taken. The page says so rather than spinning forever.
			audit(address, 'demo_refused', {
				detail: { why: 'full', out: demoAccountCount() },
				ip: address
			});
			return { full: true };
		}

		await auth.api.signInEmail({
			body: { email: account.email, password: account.password },
			headers: event.request.headers,
			asResponse: false
		});

		redirect(303, next);
	}
};
