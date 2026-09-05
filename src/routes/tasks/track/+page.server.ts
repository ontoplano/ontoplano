import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { addDays, getMonday } from '$lib/server/week-generator';

/**
 * Track was folded into the board.
 *
 * It listed the same occurrences the board arranges, and everything it could do
 * to one of them — its time, its length, what it turned out to be, what to call
 * it — the board's card editor now does. This keeps old links working, and
 * translates the week/day pair it used into the date the board takes.
 */
function pad(n: number): string {
	return String(n).padStart(2, '0');
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);

	const week = url.searchParams.get('week');
	const day = url.searchParams.get('day');

	const monday =
		week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00`) : getMonday(ctx.now);

	const offset = day && /^\d$/.test(day) ? Math.min(Number(day), 6) : null;
	const target = offset === null ? ctx.now : addDays(monday, offset);
	const date = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;

	redirect(308, `/tasks/board?date=${date}`);
};
