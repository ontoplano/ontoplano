import type { Actions, PageServerLoad } from './$types';
import { recentEvents, searchAccounts, setRole } from '$lib/server/services/admin';
import { dismissFailure, openFailures, retryFailure } from '$lib/server/services/mail-log';
import { protection } from '$lib/server/services/protection';
import { toActionFailure, ValidationError } from '$lib/server/services/errors';

export const load: PageServerLoad = async ({ url, locals }) => {
	const query = url.searchParams.get('q') ?? '';

	return {
		query,
		accounts: searchAccounts(query),
		events: recentEvents(),
		// Mail that did not go out. The same list /healthz counts, so the alert
		// on a phone and the page it points at cannot disagree.
		mailFailures: openFailures(),
		// What the layer in front of the app has been doing. Read from fail2ban's
		// log, and honest about not being able to read it.
		protection: protection(),
		// So the page can leave your own row alone rather than offering a button
		// the server will refuse.
		me: locals.user!.id
	};
};

export const actions: Actions = {
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
