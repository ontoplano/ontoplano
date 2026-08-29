import type { RequestHandler } from './$types';

import { authenticateApi, readJson } from '$lib/server/api/auth';
import { ValidationError, toJsonError } from '$lib/server/services/errors';
import { setBought } from '$lib/server/services/shopping';

/**
 * State, not a toggle: `{ "bought": true }` twice means bought, not un-bought.
 * A plugin mirroring two lists needs to be able to repeat itself.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'shopping:write');
		const body = await readJson(event);
		if (typeof body.bought !== 'boolean')
			throw new ValidationError('bought has to be true or false');

		const { changed } = setBought(ctx, Number(event.params.id), body.bought);
		return Response.json({ bought: body.bought, changed });
	} catch (e) {
		return toJsonError(e);
	}
};
