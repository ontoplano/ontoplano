import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The old addresses of the Notebooks room, kept answering.
 *
 * The room lived at /diary with the notebooks as its second tab; it lives at
 * /notebooks now with the diary as its second tab. Bookmarks, installed
 * apps and links in old mail still say /diary, and an address that worked
 * yesterday answering 404 today is a broken app, not a rename.
 */
export const load: PageServerLoad = ({ params, url }) => {
	const rest = params.rest;
	const target =
		rest === '' || rest === undefined
			? '/notebooks/diary'
			: rest === 'notebooks'
				? '/notebooks'
				: rest.startsWith('notebooks/')
					? `/notebooks/${rest.slice('notebooks/'.length)}`
					: rest === 'people' || rest.startsWith('people/')
						? `/notebooks/${rest}`
						: '/notebooks/diary';
	redirect(301, target + url.search);
};
