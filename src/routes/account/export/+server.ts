import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The export moved with the page it hangs off. */
export const GET: RequestHandler = async () => {
	redirect(301, '/settings/account/export');
};
