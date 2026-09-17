import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

/**
 * The gallery moved into the Media room.
 *
 * It was the whole room; it is one of two tabs now, and recordings are the
 * other. Kept as a redirect rather than deleted because this address is in
 * people's history and on the home screen of anybody who added it there.
 */
export const load = () => {
	redirect(308, resolve('/media/gallery'));
};
