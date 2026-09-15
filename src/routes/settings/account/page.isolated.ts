/**
 * The account page, on an instance that is a device.
 *
 * Most of what this page is about needs a server: an address to sign in with,
 * a password, the sessions it opened, mail. None of that exists here. What
 * does exist is the part people actually come to an account page for when
 * things go wrong — your data going out, coming in, and being destroyed — and
 * those work over the device's own database exactly as they do over a
 * server's, because the walk over every table holding user data is one file
 * both of them run.
 *
 * The screen is the same `+page.svelte`: it draws the cards this data has and
 * leaves out the ones it does not.
 */
import { fail } from '@sveltejs/kit';
import { deleteAccount } from '$lib/services/account-data.js';
import { ERASE_CONFIRMATION } from '$lib/danger.js';
import { toActionFailure } from '$lib/http-errors.js';
import type { IsolatedEvent } from '$lib/isolated/routes.js';

export async function load({ url }: IsolatedEvent) {
	return {
		/*
		 * The one flag the screen branches on.
		 *
		 * Everything that needs a server behind it is hidden by this rather
		 * than by testing each absent thing in turn, so a card added later is
		 * visible here until somebody decides it should not be — which is the
		 * right way round for a page about somebody's data.
		 */
		onDevice: true,
		/** Named rather than described: the card says which instance this is. */
		host: url.host,
		email: '',
		emailVerified: true,
		emailChangeAllowed: false,
		emailConfigured: false,
		weeklyReviewMail: false,
		weeklyReviewHour: '07:00',
		sessions: [],
		// No plan to limit it and nobody else's server to protect: the export
		// is a file this device writes for the person holding it.
		exports: { remaining: Infinity, allowed: Infinity, unlocksIn: null },
		nativeApp: false
	};
}

export const actions = {
	/**
	 * Delete this instance and everything in it.
	 *
	 * The hard one, and the only one here. On a server there are two — empty
	 * the account but keep it, or end the account — and what tells them apart
	 * is the address you sign in with afterwards. There is no address here:
	 * destroying the data and destroying the instance are one act, and what
	 * follows it is the screen that chooses where your ontoplano lives, where
	 * making a new one is a press away. A second, softer button would reach the
	 * same state by a longer road.
	 *
	 * The rows go here; the file they were in goes in the page, which is where
	 * the worker can be asked to empty its own storage — this body runs inside
	 * that worker and cannot wait on it. No password, because there is none to
	 * ask for: what stands in its place is the word the dialog already makes
	 * somebody type.
	 */
	async delete({ request, locals }: IsolatedEvent) {
		const formData = await request.formData();
		if (
			String(formData.get('confirm') ?? '')
				.trim()
				.toUpperCase() !== ERASE_CONFIRMATION
		)
			return fail(400, { message: `Type “${ERASE_CONFIRMATION}” exactly to confirm` });

		try {
			deleteAccount(locals.user!.id);
		} catch (e) {
			return toActionFailure(e);
		}
		// `fail` rather than a redirect: the page has one more thing to do, and
		// a redirect would take it away before it could.
		return fail(200, { success: true, gone: true });
	}
};
