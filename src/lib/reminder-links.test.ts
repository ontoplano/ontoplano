import { describe, expect, it } from 'vitest';
import { reminderLink } from './reminder-links';

/**
 * A notification opens the thing it is about.
 *
 * The rule already held for the ones an assistant writes; reminders had two
 * copies of the answer, one in the browser and one in the delivery job, and
 * neither knew about anything but a birthday. Everything else — the weekly
 * review, a bill, a todo — was sent to the day's board, which is where a
 * block belongs and not where any of those do.
 */
const at = (kind: string | null, remindAt: string, subjectId: number | null = null) =>
	reminderLink({ subjectKind: kind, subjectId, remindAt });

describe('where a reminder leads', () => {
	it('sends the weekly nag to the week it is nagging about', () => {
		// Written on the morning the week turns over, so the week it is about is
		// the one the day before belongs to.
		expect(at('review', '2026-09-21T07:00:00')).toEqual({
			route: '/tasks/review',
			query: '?week=2026-09-20'
		});
	});

	it('sends a bill to the bills', () => {
		expect(at('bill', '2026-09-21T09:00:00', 4).route).toBe('/finance/bills');
	});

	it('sends a todo to the todo list', () => {
		expect(at('todo', '2026-09-21T09:00:00', 7).route).toBe('/tasks/todo');
	});

	it('sends a birthday to the person whose it is', () => {
		expect(at('person', '2026-09-21T09:00:00', 12)).toEqual({
			route: '/notebooks/people',
			query: '?person=12'
		});
	});

	it('sends a block, the end of a day and a bare alarm to that day', () => {
		for (const kind of ['instance', 'day', 'free']) {
			expect(at(kind, '2026-09-21T18:00:00')).toEqual({
				route: '/tasks/board',
				query: '?date=2026-09-21'
			});
		}
	});

	it('sends a kind it has never heard of to the day it was for', () => {
		// Rows written before a kind existed still fire; the day is the best
		// guess available and a better one than going nowhere.
		expect(at('something-new', '2026-09-21T18:00:00').route).toBe('/tasks/board');
		expect(at(null, '2026-09-21T18:00:00').route).toBe('/tasks/board');
	});

	it('crosses a month end without arithmetic going wrong', () => {
		expect(at('review', '2026-10-01T07:00:00').query).toBe('?week=2026-09-30');
		expect(at('review', '2027-01-01T07:00:00').query).toBe('?week=2026-12-31');
	});

	it('names a person page even with no person on the row', () => {
		expect(at('person', '2026-09-21T09:00:00', null)).toEqual({
			route: '/notebooks/people',
			query: ''
		});
	});
});
