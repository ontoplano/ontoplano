import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { mealsBetween, neededBetween } from '$lib/server/services/recipes';
import { getCurrency } from '$lib/server/settings';

/** The seven days from a date, as `YYYY-MM-DD`. */
function week(fromISO: string): string[] {
	const start = new Date(`${fromISO}T12:00:00`);
	return Array.from({ length: 7 }, (_, i) => {
		const day = new Date(start);
		day.setDate(day.getDate() + i);
		return day.toISOString().slice(0, 10);
	});
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);

	const today = new Date(ctx.now).toISOString().slice(0, 10);
	const days = week(url.searchParams.get('from') ?? today);
	const to = days[days.length - 1];

	return {
		days,
		today,
		from: days[0],
		to,
		meals: mealsBetween(ctx, days[0], to),
		needed: neededBetween(ctx, days[0], to),
		currency: getCurrency(ctx.userId)
	};
};
