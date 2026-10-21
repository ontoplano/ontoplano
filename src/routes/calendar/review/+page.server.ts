import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { ValidationError } from '$lib/services/errors';
import {
	carryIntoTodos,
	goalsTouched,
	readWeek,
	resolveLoose,
	readNote,
	saveNote,
	settleWeek,
	type Verdict,
	weekStartOf
} from '$lib/services/review';
import { completeStale, dropStale, keepStale, listStale, STALE_MONTHS } from '$lib/services/stale';
import { setInstanceStatus } from '$lib/services/instances';
import { addDays, getISOWeekNumber, getISOWeekYear } from '$lib/services/week-generator';
import { formAction } from '$lib/services/scoped-actions';
import { localDay } from '$lib/services/time';

/**
 * This week, by default.
 *
 * It used to open on last week, on the reasoning that a week is reviewed once
 * it is over. But the page you land on is the page you think you are looking
 * at, and landing a week behind means reading Monday's numbers as though they
 * were today's — every arrival started with working out which week this is.
 * Last week is one press of the arrow, and the dashboard links straight to it
 * when it is still open.
 */
export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const param = url.searchParams.get('week');
	const weekStart = weekStartOf(ctx, param ?? localDay(ctx.now));

	const monday = new Date(weekStart + 'T00:00:00');
	const { reading, loose, done, skipped } = readWeek(ctx, weekStart);
	const isCurrent = weekStart === weekStartOf(ctx, localDay(ctx.now));

	return {
		reading,
		loose,
		done,
		skipped,
		goals: goalsTouched(ctx, weekStart),
		note: readNote(ctx, weekStart),
		/** Things nothing has ever asked about. Only offered on a finished week. */
		stale: isCurrent ? [] : listStale(ctx),
		staleMonths: STALE_MONTHS,
		week: {
			number: getISOWeekNumber(monday),
			year: getISOWeekYear(monday),
			prev: localDay(addDays(monday, -7)),
			next: localDay(addDays(monday, 7)),
			isCurrent
		}
	};
};

/** Which table a stale row came from. Anything else is not a table. */
function sortOf(raw: FormDataEntryValue | null): 'todo' | 'idea' | 'inventory' {
	const v = String(raw ?? '');
	if (v === 'todo' || v === 'idea' || v === 'inventory') return v;
	throw new ValidationError({ key: 'errors.review.unknownKind' });
}

export const actions = {
	saveNote: formAction((ctx, formData) => {
		saveNote(ctx, {
			weekStart: formData.get('weekStart'),
			content: formData.get('note')
		});
		return { success: true, saved: true };
	}),

	keepStale: formAction((ctx, formData) => {
		keepStale(ctx, sortOf(formData.get('sort')), Number(formData.get('id')));
	}),

	completeStale: formAction((ctx, formData) => {
		completeStale(ctx, sortOf(formData.get('sort')), Number(formData.get('id')));
	}),

	dropStale: formAction((ctx, formData) => {
		dropStale(ctx, sortOf(formData.get('sort')), Number(formData.get('id')));
	}),

	/** Done, or skipped — the two answers that are not "carry it forward". */
	resolve: formAction((ctx, formData) => {
		const raw = String(formData.get('status') ?? '');
		if (raw !== 'done' && raw !== 'skipped')
			throw new ValidationError({ key: 'errors.review.invalidStatus' });

		const resolved = resolveLoose(
			ctx,
			weekStartOf(ctx, formData.get('weekStart')),
			formData.getAll('instanceId'),
			raw
		);
		return { success: true, resolved };
	}),

	/**
	 * "I did not actually do that."
	 *
	 * A block answered for is not a block answered *correctly*, and the review
	 * is where somebody notices. Back to open rather than straight to skipped:
	 * it rejoins the list of open questions, where the four ordinary answers
	 * are — including the ones that make a todo out of it.
	 */
	reopen: formAction((ctx, formData) => {
		setInstanceStatus(ctx, Number(formData.get('instanceId')), 'todo');
		return { success: true, action: 'reopen' };
	}),

	/**
	 * Everything marked up on the page, applied at once.
	 *
	 * The verdicts arrive as one field per answered block —
	 * `verdict=<id>:<verb>[:<date>]` — because a form posts repeated names as a
	 * list and this is one list rather than four parallel ones that could get
	 * out of step with each other.
	 */
	settle: formAction((ctx, formData) => {
		const verdicts: Verdict[] = [];
		for (const raw of formData.getAll('verdict')) {
			const [id, verb, date] = String(raw).split(':');
			if (!Number.isInteger(Number(id))) continue;
			if (verb !== 'done' && verb !== 'skipped' && verb !== 'todo') continue;
			verdicts.push({ id: Number(id), verb, ...(date ? { date } : {}) });
		}

		const settled = settleWeek(ctx, weekStartOf(ctx, formData.get('weekStart')), verdicts);
		return { success: true, settled };
	}),

	carry: formAction((ctx, formData) => {
		// A date, when the answer was "not then, but on this day". Without one
		// it lands on the undated pile, which is what carrying always meant.
		const day = String(formData.get('scheduledDate') ?? '').trim();
		const carried = carryIntoTodos(
			ctx,
			weekStartOf(ctx, formData.get('weekStart')),
			formData.getAll('instanceId'),
			day || undefined
		);
		return { success: true, carried, scheduled: Boolean(day) };
	})
};
