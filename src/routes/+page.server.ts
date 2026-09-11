import type { Actions, PageServerLoad } from './$types';
import { docsUrl, siteUrl } from '$lib/server/settings';
import { loadConfig } from '$lib/server/config';
import { instanceIsEmpty, registrationMode } from '$lib/server/services/registration';
import { load as dashboard, actions as local } from './page.local';

export const load: PageServerLoad = async (event) => {
	/*
	 * Signed out, this is the pitch rather than the dashboard.
	 *
	 * A door, not a pitch: everything this used to assemble — the price, the
	 * trial length, the video, the demo link — was for the landing page, which
	 * now lives at ontoplano.com in a repository of its own. What is left is
	 * the one fact the door needs: whether there is any point offering a
	 * Register button. The dashboard itself lives in page.local.ts, because it
	 * is the same dashboard on a local instance.
	 */
	if (!event.locals.user) {
		return {
			frontDoor: {
				canRegister: instanceIsEmpty() || registrationMode() !== 'closed',
				// The operator's sentence, not the app's — see config.toml.
				tagline: loadConfig().instance.tagline,
				// Where this deployment's own site and docs are. Production
				// answers with the project's; staging answers with staging's.
				siteUrl: siteUrl(),
				docsUrl: docsUrl()
			}
		};
	}

	return dashboard({
		request: event.request,
		url: event.url,
		params: event.params,
		locals: { user: event.locals.user }
	});
};

export const actions: Actions = local;
