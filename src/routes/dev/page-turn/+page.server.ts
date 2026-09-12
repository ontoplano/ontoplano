import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { devToolsEnabled } from '$lib/server/settings';

/**
 * A workbench, not a screen of the app.
 *
 * The dissolve is decided by watching it, not by reading three numbers, so
 * this exists to be opened on a real phone and fiddled with. It is not a
 * preference and it is not shipped: an instance answers 404 unless its env
 * file says `ONTOPLANO_DEV_TOOLS=true`, and anyone running one never learns
 * it was here. A setting rather than "is this staging", because staging runs
 * production's code.
 */
export const load: PageServerLoad = async () => {
	if (!dev && !devToolsEnabled()) error(404, 'Not found');
	return {};
};
