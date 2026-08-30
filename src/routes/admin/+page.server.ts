import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recentEvents, searchAccounts, setRole } from '$lib/server/services/admin';
import { dismissFailure, openFailures, retryFailure } from '$lib/server/services/mail-log';
import {
	banControlEnabled,
	blockForever,
	permanentlyBlocked,
	protection,
	unban,
	unblockForever
} from '$lib/server/services/protection';
import { dismissClientError, recentClientErrors } from '$lib/server/services/client-errors';
import { toActionFailure, ValidationError } from '$lib/server/services/errors';

export const load: PageServerLoad = async ({ url, locals }) => {
	const query = url.searchParams.get('q') ?? '';
	// How far back the history goes. Bounded: this is a page, and "all of it"
	// on an instance in use is a query nobody meant to run.
	const eventLimit = Math.min(Math.max(Number(url.searchParams.get('events')) || 25, 25), 500);

	return {
		query,
		eventLimit,
		accounts: searchAccounts(query),
		events: recentEvents(eventLimit),
		// What broke in somebody's browser, when they let us hear about it. It
		// used to go only to the log, which on this box is journald — so a
		// report reached nobody who was not already tailing it.
		clientErrors: recentClientErrors(),
		// Mail that did not go out. The same list /healthz counts, so the alert
		// on a phone and the page it points at cannot disagree.
		mailFailures: openFailures(),
		// What the layer in front of the app has been doing. Read from fail2ban's
		// log, and honest about not being able to read it.
		protection: protection(),
		// Whether this box has been given the one sudo rule that lets the app
		// act on a ban. Off means the list is shown and no buttons are.
		canControlBans: banControlEnabled(),
		blockedForever: permanentlyBlocked(),
		// So the page can leave your own row alone rather than offering a button
		// the server will refuse.
		me: locals.user!.id
	};
};

export const actions: Actions = {
	/*
	 * Acting on a ban. Every argument is validated again by the root-side
	 * helper, which is where the trust boundary actually is — these are the
	 * page's half of it, not the whole of it.
	 */
	unban: async ({ request }) => {
		const formData = await request.formData();
		try {
			unban(String(formData.get('jail') ?? ''), String(formData.get('address') ?? ''));
			return { success: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'Could not unban that' });
		}
	},

	blockForever: async ({ request }) => {
		const formData = await request.formData();
		try {
			blockForever(String(formData.get('address') ?? ''));
			return { success: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'Could not block that' });
		}
	},

	unblockForever: async ({ request }) => {
		const formData = await request.formData();
		try {
			unblockForever(String(formData.get('address') ?? ''));
			return { success: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'Could not unblock that' });
		}
	},

	dismissReport: async ({ request }) => {
		const formData = await request.formData();
		dismissClientError(Number(formData.get('id')));
		return { success: true };
	},

	setRole: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setRole(locals.user!.id, formData.get('id')?.toString() ?? '', formData.get('role'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},
	retryMail: async ({ request }) => {
		const formData = await request.formData();
		try {
			const result = await retryFailure(Number(formData.get('id')));
			if (!result.delivered) {
				return toActionFailure(
					new ValidationError(`Still not going out: ${result.reason ?? 'unknown'}`)
				);
			}
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},
	dismissMail: async ({ request }) => {
		const formData = await request.formData();
		try {
			dismissFailure(Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
