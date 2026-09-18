import type { IsolatedEvent } from '$lib/isolated/routes';
import { translatorFor } from '$lib/i18n/core';
import { SOURCE_LOCALE } from '$lib/i18n/locales';
import { getLocale } from '$lib/services/settings';
import { buildCtx, localDateOf } from '$lib/services/ctx';
import { localOfInstant } from '$lib/services/time';
import { REMINDER_LEAD_MINUTES } from '$lib/reminder-window';
import { ensureOwnReminders } from '$lib/services/reminder-sources';
import {
	MAX_UPCOMING_DAYS,
	upcomingDerived,
	upcomingWindow,
	windowEnd
} from '$lib/services/reminder-sources';
import { toActionFailure } from '$lib/http-errors';
import { host } from '$lib/services/host';
import {
	createFreeReminder,
	editReminder,
	localNow,
	deleteReminder,
	dismissReminder,
	listReminders,
	startOfDay
} from '$lib/services/reminders';
import {
	addRingtone,
	listRingtones,
	MAX_RINGTONE_BYTES,
	MAX_RINGTONES,
	removeRingtone,
	setSoundChoice,
	soundChoices
} from '$lib/services/ringtones';

/**
 * Everything with a time on it.
 *
 * Reminders were scattered: a block carried one, a birthday made one, and the
 * only way to see what was coming was to wait for it. This is the list — and
 * the place to set one that is about nothing at all, which is what an alarm
 * clock is.
 */
export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	// How far ahead to look. In the address bar rather than in a preference:
	// it is a question you ask once — "and what about November?" — not a
	// setting you keep, and this way the answer is a link you can send.
	const days = upcomingWindow(url.searchParams.get('days'));
	/*
	 * Forwards or backwards over the same window.
	 *
	 * "Coming up" hid everything that had already fired, which is right for a
	 * list of what is ahead and wrong as the only view there is: the question
	 * "did that alarm actually go off?" has nowhere to be answered. So the same
	 * control looks either way, and the past view shows the rows that exist —
	 * including the dismissed ones, which are precisely the ones being asked
	 * about.
	 */
	const past = url.searchParams.get('past') === '1';
	// Wall-clock in the account's own zone, which is the shape `remind_at` is
	// stored in, so the two compare as strings.
	const now = localNow(ctx);
	/** How far back the past view reaches: the same window, the other way. */
	const floor = localOfInstant(new Date(ctx.now.getTime() - days * 86_400_000), ctx.tz);
	/*
	 * And how far ahead it reaches, which nothing was enforcing.
	 *
	 * The derived rows have always stopped at the horizon; the stored ones were
	 * only filtered for being in the future, so asking for the next day
	 * answered with December's alarm as well. Both halves are one list and have
	 * to end in the same place — the last day the window covers, all of it.
	 */
	const ceiling = `${windowEnd(ctx.now, ctx.tz, days)}T23:59:59`;

	/*
	 * Today's birthdays are written here as well as by the delivery pass.
	 *
	 * Same reason `/api/reminders` does it: an instance with no push keys runs
	 * no delivery, so a birthday, a bill or a block starting would exist only
	 * for accounts that had set push up. Idempotent per day, so the writers
	 * cannot make two.
	 */
	/*
	 * The language this page is being rendered in, which `hooks.server.ts` has
	 * already worked out — the account's choice, then the browser's, then the
	 * instance's. Re-deriving it here would be a second answer to a settled
	 * question — the fallback is for the isolated instance, which runs these
	 * routes without those hooks and has exactly one account to ask.
	 *
	 * Asked of the settings service rather than of `$lib/server/locale`: these
	 * routes run on the device too, where there is no server half to import.
	 */
	const t = await translatorFor(locals.locale ?? getLocale(locals.user!.id) ?? SOURCE_LOCALE);
	ensureOwnReminders(ctx, ctx.now, ctx.tz, t);

	return {
		/*
		 * Whether this phone has been given a key to ring with.
		 *
		 * The page cannot ask the phone: it is served by the instance, and the
		 * app's plugins reach only the copy it carries. But the instance minted
		 * the key, so it knows one exists — which is the difference between
		 * "reminders ring here with the app closed" and "they do not", and the
		 * page was asserting the second long after the first became true.
		 */
		ringsOnAPhone: host.ringsOnAPhone(ctx),
		/** Today in the account's own zone, so the day field opens on it. */
		today: localDateOf(ctx.now, ctx.tz),
		/*
		 * The account's own wall clock at the moment this was rendered.
		 *
		 * The form has to refuse a time the server would refuse, and "now" here
		 * means now *where the account is* — the browser's clock is the machine's
		 * zone, which is the account's only by luck. The page ages it forward by
		 * how long it has been open, so a form left sitting does not keep
		 * offering a floor from an hour ago.
		 */
		nowLocal: localOfInstant(ctx.now, ctx.tz).slice(0, 16),
		leadMinutes: REMINDER_LEAD_MINUTES,
		/*
		 * And now, to the minute, so the form can refuse a time that has been.
		 *
		 * The service refuses it either way — a reminder set for a time that has
		 * passed is due the moment it is made — but a form that lets somebody
		 * fill in three fields and then hands back an error about the first is a
		 * form that wasted their typing. The account's own zone, because that is
		 * what the column holds.
		 */
		now: now.slice(0, 16),
		/** What an empty time means, so the field can say so. */
		dayStart: startOfDay(ctx.userId),
		/*
		 * The rows that exist, minus the ones that are only ever a notification.
		 *
		 * The weekly-review nag is a sentence about now, not an appointment —
		 * it belongs on the phone at seven in the morning and not in a list of
		 * things that are going to happen. The dashboard already carries the
		 * standing version of it.
		 */
		reminders: past
			? listReminders(ctx, { includePast: true })
					.filter((r) => r.subjectKind !== 'review' && r.remindAt < now && r.remindAt >= floor)
					// Newest first: looking back, the thing you want is the last one.
					.reverse()
			: listReminders(ctx).filter(
					(r) =>
						r.subjectKind !== 'review' &&
						// And nothing that has already been: a list called "coming up"
						// that holds this morning's alarm is a list you read past.
						r.remindAt >= now &&
						r.remindAt <= ceiling
				),
		/*
		 * Birthdays and bills that are coming but are not rows yet.
		 *
		 * Only ahead. These are worked out on the spot precisely because they
		 * have not happened, so a backwards version of them would be a list of
		 * reminders that were never given — which is not what "previous
		 * reminders" means.
		 */
		upcoming: past ? [] : upcomingDerived(ctx, ctx.now, ctx.tz, t, days),
		past,
		days,
		maxDays: MAX_UPCOMING_DAYS,
		ringtones: listRingtones(ctx),
		sounds: soundChoices(ctx),
		limits: { ringtones: MAX_RINGTONES, kilobytes: MAX_RINGTONE_BYTES / 1024 }
	};
};

export const actions = {
	create: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			// Two fields, one instant: the form asks the day and the time
			// separately because a single datetime control is one box carrying
			// two questions and looks it. Only the day is required — a day on its
			// own means the hour the account's day starts, filled in downstairs.
			const day = String(form.get('day') ?? '').trim();
			const time = String(form.get('time') ?? '').trim();
			createFreeReminder(buildCtx(locals.user!.id), {
				at: day && time ? `${day}T${time}` : day,
				message: form.get('label'),
				audible: form.get('audible') === 'on',
				ringtoneId: form.get('ringtoneId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * The same four questions the form above asked, asked again about a row.
	 *
	 * `audible` arrives as a word rather than a checkbox: a row can say "make a
	 * noise", "stay silent", or neither — and neither is what a nudge before a
	 * block says before anybody overrides it, meaning "whatever this kind of
	 * reminder does". A checkbox has no way to say the third thing.
	 */
	edit: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			const day = String(form.get('day') ?? '').trim();
			const time = String(form.get('time') ?? '').trim();
			const sound = String(form.get('sound') ?? 'kind');
			editReminder(buildCtx(locals.user!.id), Number(form.get('id')), {
				at: day && time ? `${day}T${time}` : day,
				message: form.get('label'),
				audible: sound === 'kind' ? null : sound === 'on',
				ringtoneId: form.get('ringtoneId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	dismiss: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		dismissReminder(buildCtx(locals.user!.id), Number(form.get('id')));
		return { success: true };
	},

	remove: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		deleteReminder(buildCtx(locals.user!.id), Number(form.get('id')));
		return { success: true };
	},

	addSound: async ({ request, locals }: IsolatedEvent) => {
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

	removeSound: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			removeRingtone(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setSound: async ({ request, locals }: IsolatedEvent) => {
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
