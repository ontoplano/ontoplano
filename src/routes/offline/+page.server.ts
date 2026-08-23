import type { PageServerLoad } from './$types';

/**
 * Public on purpose.
 *
 * The layout guard sends signed-out visitors to /login, but this page is what a
 * failed navigation falls back to — including one where the session could not be
 * checked because there is no network.
 */
export const load: PageServerLoad = async () => ({});
