import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { SECTION_SCOPE, widgetFor } from '$lib/server/services/phone-widgets';
import { toJsonError } from '$lib/http-errors';
import { UnauthorizedError } from '$lib/services/errors';

/**
 * What the home-screen widget holding this key should draw.
 *
 * The key is the widget: its notebook, tab, filter and order are kept on the
 * instance, so they can be changed from Settings and the phone picks them up
 * on its next refresh. Only a key answers — a session has no widget.
 *
 * Any of the reads a widget can hold lets the key in; `widgetFor` then
 * checks it holds the one its own tab needs.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx, token } = authenticateApi(event, Object.values(SECTION_SCOPE), {
			confined: true
		});
		if (!token) throw new UnauthorizedError({ key: 'errors.auth.provideABearerToken' });
		return Response.json(widgetFor(ctx, token));
	} catch (e) {
		return toJsonError(e);
	}
};
