import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The planner's old addresses, kept answering.
 *
 * /planner/* became /tasks/* — same pages, new room name. Old review mails
 * link /planner/review and installed apps remember /planner/plan, so the old
 * paths redirect rather than 404.
 */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(301, `/tasks${params.rest ? `/${params.rest}` : ''}${url.search}`);
};
