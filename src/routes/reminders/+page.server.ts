import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import {
	createFreeReminder,
	deleteReminder,
	dismissReminder,
	listReminders
} from '$lib/server/services/reminders';
import {
	addRingtone,
	listRingtones,
	MAX_RINGTONE_BYTES,
	MAX_RINGTONES,
	removeRingtone,
	setSoundChoice,
	soundChoices
} from '$lib/server/services/ringtones';

/**
 * Everything with a time on it.
 *
 * Reminders were scattered: a block carried one, a birthday made one, and the
 * only way to see what was coming was to wait for it. This is the list — and
 * the place to set one that is about nothing at all, which is what an alarm
 * clock is.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		reminders: listReminders(ctx),
		ringtones: listRingtones(ctx),
		sounds: soundChoices(ctx),
		limits: { ringtones: MAX_RINGTONES, kilobytes: MAX_RINGTONE_BYTES / 1024 }
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			createFreeReminder(buildCtx(locals.user!.id), {
				at: form.get('at'),
				message: form.get('label'),
				audible: form.get('audible') === 'on',
				ringtoneId: form.get('ringtoneId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	dismiss: async ({ request, locals }) => {
		const form = await request.formData();
		dismissReminder(buildCtx(locals.user!.id), Number(form.get('id')));
		return { success: true };
	},

	remove: async ({ request, locals }) => {
		const form = await request.formData();
		deleteReminder(buildCtx(locals.user!.id), Number(form.get('id')));
		return { success: true };
	},

	addSound: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			const file = form.get('sound');
			if (!(file instanceof File)) throw new Error('No file');
			addRingtone(buildCtx(locals.user!.id), {
				name: (form.get('label') || file.name.replace(/\.[^.]+$/, '')) as string,
				mime: file.type,
				data: new Uint8Array(await file.arrayBuffer())
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	removeSound: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			removeRingtone(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setSound: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			const chosen = String(form.get('ringtoneId') ?? '');
			setSoundChoice(buildCtx(locals.user!.id), form.get('kind'), {
				audible: form.get('audible') === 'on',
				ringtoneId: chosen ? Number(chosen) : null
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
