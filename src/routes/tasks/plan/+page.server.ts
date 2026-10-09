import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The calendar's old address, kept answering.
 *
 * /tasks/plan became /tasks/calendar — same page, new name. Installed apps,
 * widgets and old links remember the old path, so it redirects rather than 404.
 */
export const load: PageServerLoad = ({ url }) => {
	redirect(301, `/tasks/calendar${url.search}`);
};
