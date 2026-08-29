import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/services/errors';
import { listItems } from '$lib/server/services/shopping';

/** The whole list, bought and waiting alike — the reader decides what matters. */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'shopping:read');
		return Response.json({
			items: listItems(ctx).map((i) => ({
				id: i.id,
				name: i.name,
				type: i.type,
				category: i.shoppingCategoryName,
				notes: i.notes,
				bought: i.bought,
				bought_at: i.boughtAt,
				snoozed: i.snoozed,
				price_cents: i.priceCents,
				created_at: i.createdAt
			}))
		});
	} catch (e) {
		return toJsonError(e);
	}
};
