import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { neededBetween } from '$lib/server/services/recipes';
import { getCurrency } from '$lib/server/settings';
import { db } from '$lib/server/db';
import { and, eq, sql } from 'drizzle-orm';
import { exceptionalSlots, recipes } from '$lib/server/db/schema';

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
	const from = url.searchParams.get('from') ?? today;
	const days = week(from);
	const to = days[days.length - 1];

	const meals = db
		.select({
			id: exceptionalSlots.id,
			date: exceptionalSlots.date,
			startTime: exceptionalSlots.startTime,
			recipeId: exceptionalSlots.recipeId,
			title: recipes.title,
			minutes: recipes.minutes
		})
		.from(exceptionalSlots)
		.innerJoin(recipes, eq(exceptionalSlots.recipeId, recipes.id))
		.where(
			and(
				eq(exceptionalSlots.userId, ctx.userId),
				sql`${exceptionalSlots.date} >= ${days[0]}`,
				sql`${exceptionalSlots.date} <= ${to}`
			)
		)
		.orderBy(exceptionalSlots.date, exceptionalSlots.startTime)
		.all();

	return {
		days,
		today,
		from: days[0],
		to,
		meals,
		needed: neededBetween(ctx, days[0], to),
		currency: getCurrency(ctx.userId)
	};
};
