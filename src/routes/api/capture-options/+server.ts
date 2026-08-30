import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { listCategories as listPlannerCategories } from '$lib/server/services/activities';
import { listCategories as listShoppingCategories } from '$lib/server/services/shopping';
import { listNotebooks } from '$lib/server/services/notebooks';

/**
 * The choices the capture dialogs offer, fetched when one opens.
 *
 * Capture lives in the app shell, which is on every page — so putting these
 * into the layout's own load would run three queries on every request to serve
 * a dialog most visits never open. Asked for once, the first time one is
 * opened, and held for the rest of the session.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ categories: [], notebooks: [], shoppingCategories: [] });

	const ctx = buildCtx(locals.user.id);
	return json({
		categories: listPlannerCategories(ctx).map((c) => ({ id: c.id, name: c.name })),
		notebooks: listNotebooks(ctx).map((n) => ({ id: n.id, title: n.title })),
		shoppingCategories: listShoppingCategories(ctx).map((c) => ({ id: c.id, name: c.name }))
	});
};
