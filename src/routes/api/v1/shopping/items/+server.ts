import type { RequestHandler } from './$types';

import { authenticateApi, readJson } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/services/errors';
import { createItem, ensureCategoryId } from '$lib/server/services/shopping';

/**
 * Put something on the list.
 *
 * The same semantics as typing it in the app: a name already held is put back
 * on the list rather than duplicated, and the response says which happened.
 * `category` is a name, created if new — a producer should not need a second
 * request to find out what number "Dairy" is.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'shopping:write');
		const body = await readJson(event);

		const { alreadyHad } = createItem(ctx, {
			name: body.name,
			type: body.type ?? 'replenish',
			notes: body.notes,
			shoppingCategoryId:
				body.category === undefined || body.category === null || body.category === ''
					? undefined
					: ensureCategoryId(ctx, body.category)
		});

		return Response.json({ already_had: alreadyHad }, { status: alreadyHad ? 200 : 201 });
	} catch (e) {
		return toJsonError(e);
	}
};
