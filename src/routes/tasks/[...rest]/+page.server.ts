import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The room's old addresses, kept answering.
 *
 * /tasks/* became /calendar/* — same pages, the room renamed for what it opens
 * on. Review mails, notifications, bookmarks and installed apps remember the old
 * paths, so they redirect rather than 404.
 */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(301, `/calendar${params.rest ? `/${params.rest}` : ''}${url.search}`);
};
