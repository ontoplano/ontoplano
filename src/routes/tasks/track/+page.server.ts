import type { IsolatedEvent } from '$lib/isolated/routes';
import { redirect } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { addDays, getMonday } from '$lib/services/week-generator';
import { pad2 } from '$lib/services/time';

export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);

	const week = url.searchParams.get('week');
	const day = url.searchParams.get('day');

	const monday =
		week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00`) : getMonday(ctx.now);

	const offset = day && /^\d$/.test(day) ? Math.min(Number(day), 6) : null;
	const target = offset === null ? ctx.now : addDays(monday, offset);
	const date = `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`;

	redirect(308, `/tasks/board?date=${date}`);
};
