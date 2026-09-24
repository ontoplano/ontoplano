import type { IsolatedEvent } from '$lib/isolated/routes';
import { json } from '@sveltejs/kit';
import { deleteFilter, saveFilter, savedFilters } from '$lib/services/saved-filters';
import { toActionFailure } from '$lib/http-errors';

/**
 * The filters one screen has kept, and the two things done to them.
 *
 * An endpoint rather than actions on each page: every list that narrows itself
 * wants this, and the alternative is the same three handlers copied into the
 * task list, the diary, the gallery and whatever comes next. The screen names
 * itself in `surface`, and the service refuses anything that is not a path
 * this app serves — the key goes into a settings row, so a caller that could
 * put anything there could write over another setting.
 */
export const GET = async ({ locals, url }: IsolatedEvent) => {
	if (!locals.user) return json({ filters: [] });
	try {
		return json({ filters: savedFilters(locals.user.id, url.searchParams.get('surface') ?? '') });
	} catch {
		// A surface this app does not serve has nothing saved against it.
		return json({ filters: [] });
	}
};

export const POST = async ({ locals, request }: IsolatedEvent) => {
	if (!locals.user) return json({ filters: [] }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') return json({ message: 'Nothing to do' }, { status: 400 });

	const { surface, name, query, remove } = body as Record<string, unknown>;
	try {
		const filters = remove
			? deleteFilter(locals.user.id, String(surface ?? ''), name)
			: saveFilter(locals.user.id, String(surface ?? ''), name, query);
		return json({ filters });
	} catch (e) {
		const failed = toActionFailure(e);
		return json({ message: failed.data?.message ?? 'Not saved' }, { status: failed.status });
	}
};
