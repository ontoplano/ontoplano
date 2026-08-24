import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** /settings itself has no content; the account tab is the landing page. */
export const load: PageServerLoad = async () => {
	redirect(302, '/settings/account');
};
