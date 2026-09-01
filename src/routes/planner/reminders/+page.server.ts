import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	createReminder,
	deleteReminder,
	dismissReminder,
	listReminders,
	localNow,
	MAX_MESSAGE_LENGTH
} from '$lib/server/services/reminders';

/**
 * Everything this account has asked to be told about.
 *
 * Reminders existed before this page did, and could only be seen on the thing
 * they were attached to — so one attached to nothing could be created (the API
 * takes them, and the seed makes them) and then appeared nowhere at all. A
 * notification you cannot go and look at is a notification you cannot trust.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		reminders: listReminders(ctx, { includePast: true }),
		/** Wall-clock, like the reminders themselves, so "past" means the same. */
		now: localNow(ctx),
		maxMessageLength: MAX_MESSAGE_LENGTH
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createReminder(buildCtx(locals.user!.id), {
				subjectKind: 'free',
				at: formData.get('at'),
				message: formData.get('message')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Read and done with, but kept — the list is also a record. */
	dismiss: async ({ request, locals }) => {
		const formData = await request.formData();
		dismissReminder(buildCtx(locals.user!.id), Number(formData.get('id')));
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteReminder(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
