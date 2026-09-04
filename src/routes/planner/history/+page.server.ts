import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * History folded into the plan.
 *
 * The tab drew last week as a table, missed one-off blocks entirely, and
 * nothing ever sent anybody to it. The plan itself walks backwards now — past
 * days washed grey, each block marked done or not — so this only forwards the
 * bookmarks that predate that.
 */
export const load: PageServerLoad = ({ url }) => {
	const week = url.searchParams.get('week');
	redirect(301, week ? `/planner/plan?view=week&from=${week}` : '/planner/plan?view=week');
};
