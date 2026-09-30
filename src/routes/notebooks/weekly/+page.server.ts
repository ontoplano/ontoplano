import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { ValidationError } from '$lib/services/errors';
import { toActionFailure } from '$lib/http-errors';
import { MAX_NOTE_LENGTH, pastNotes, readNote, saveNote, weekStartOf } from '$lib/services/review';

/** A civil date. Anything else would quietly fall back to this week. */
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function weekAsked(ctx: ReturnType<typeof buildCtx>, raw: FormDataEntryValue | null): string {
	if (typeof raw !== 'string' || !CIVIL_DATE.test(raw))
		throw new ValidationError({ key: 'errors.instances.invalidDate' });
	return weekStartOf(ctx, raw);
}

/**
 * Every week you have written about, in one place.
 *
 * The weekly note was reachable only by navigating to the week it belonged to,
 * which is a thing nobody does — so the one running account of a year this app
 * keeps was write-only. It is writing, so it belongs where the writing is.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		weeks: pastNotes(ctx, { limit: 200 }),
		thisWeek: weekStartOf(ctx),
		noteMax: MAX_NOTE_LENGTH
	};
};

export const actions = {
	/*
	 * Write or rewrite one week's note — the review's own `saveNote`, so the
	 * two screens store the same thing the same way. A new note for a week
	 * that already has one is refused rather than written over: the dialog
	 * that asked for a new one did not show the old one.
	 */
	save: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			const weekStart = weekAsked(ctx, formData.get('weekStart'));
			if (formData.get('fresh') && readNote(ctx, weekStart))
				throw new ValidationError({ key: 'errors.weekly.alreadyWritten' });
			saveNote(ctx, { weekStart, content: formData.get('note') });
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/* An emptied note is no note: `saveNote` removes the row. */
	remove: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			saveNote(ctx, { weekStart: weekAsked(ctx, formData.get('weekStart')), content: '' });
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
