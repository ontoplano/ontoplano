import type { Actions, PageServerLoad } from './$types';
import { buildCtx, localDateOf } from '$lib/server/services/ctx';
import { ensureBirthdayReminders } from '$lib/server/services/birthdays';
import {
	MAX_UPCOMING_DAYS,
	upcomingDerived,
	upcomingWindow
} from '$lib/server/services/reminder-sources';
import { toActionFailure } from '$lib/server/http-errors';
import {
	createFreeReminder,
	localNow,
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
export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	// How far ahead to look. In the address bar rather than in a preference:
	// it is a question you ask once — "and what about November?" — not a
	// setting you keep, and this way the answer is a link you can send.
	const days = upcomingWindow(url.searchParams.get('days'));
	// Wall-clock in the account's own zone, which is the shape `remind_at` is
	// stored in, so the two compare as strings.
	const now = localNow(ctx);

	/*
	 * Today's birthdays are written here as well as by the delivery pass.
	 *
	 * Same reason `/api/reminders` does it: an instance with no push keys runs
	 * no delivery, so a birthday would exist only for accounts that had set
	 * push up. Idempotent by date, so the writers cannot make two.
	 */
	ensureBirthdayReminders(ctx.userId, ctx.now, ctx.tz);

	return {
		/** Today in the account's own zone, so the day field opens on it. */
		today: localDateOf(ctx.now, ctx.tz),
		/*
		 * The rows that exist, minus the ones that are only ever a notification.
		 *
		 * The weekly-review nag is a sentence about now, not an appointment —
		 * it belongs on the phone at seven in the morning and not in a list of
		 * things that are going to happen. The dashboard already carries the
		 * standing version of it.
		 */
		reminders: listReminders(ctx).filter(
			(r) =>
				r.subjectKind !== 'review' &&
				// And nothing that has already been: a list called "coming up" that
				// holds this morning's alarm is a list you have to read past.
				r.remindAt >= now
		),
		/** Birthdays and bills that are coming but are not rows yet. */
		upcoming: upcomingDerived(ctx, ctx.now, ctx.tz, days),
		days,
		maxDays: MAX_UPCOMING_DAYS,
		ringtones: listRingtones(ctx),
		sounds: soundChoices(ctx),
		limits: { ringtones: MAX_RINGTONES, kilobytes: MAX_RINGTONE_BYTES / 1024 }
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			// Two fields, one instant: the form asks the day and the time
			// separately because a single datetime control is one box carrying
			// two questions and looks it.
			const day = String(form.get('day') ?? '').trim();
			const time = String(form.get('time') ?? '').trim();
			createFreeReminder(buildCtx(locals.user!.id), {
				at: day && time ? `${day}T${time}` : '',
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
