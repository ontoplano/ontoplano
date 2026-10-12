import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The planner's old addresses, kept answering.
 *
 * /planner/* became /tasks/*, and then /calendar/* — same pages, new room
 * name. Old review mails link /planner/review and installed apps remember
 * /planner/plan, so the old paths redirect rather than 404, straight to where
 * they are now.
 */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(301, `/calendar${params.rest ? `/${params.rest}` : ''}${url.search}`);
};
