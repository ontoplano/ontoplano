import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { SECTION_SCOPE } from '$lib/server/services/phone-widgets';
import { toJsonError } from '$lib/http-errors';
import { NotFoundError } from '$lib/services/errors';
import { sectionItems } from '$lib/services/notebook-sections';
import { isWidgetSection, widgetQuery } from '$lib/notebook-widget';

/**
 * One tab of one notebook, as lines — what a widget draws.
 *
 * `?status=`, `?order=`, `?direction=`, `?tag=` and `?limit=` take the choices
 * `$lib/notebook-widget` lists for the tab; anything else falls back to the
 * tab's first. The grant is the tab's own read (`SECTION_SCOPE`), and a key
 * pinned to a notebook answers for that notebook alone: asking for another is
 * the same 404 as asking for somebody else's.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const section = event.params.section;
		if (!isWidgetSection(section)) throw new NotFoundError('section');
		const id = Number(event.params.id);
		if (!Number.isInteger(id) || id <= 0) throw new NotFoundError('notebook');

		const { ctx, token } = authenticateApi(event, SECTION_SCOPE[section], { confined: true });
		const pinned = token?.confinement;
		if (pinned && (pinned.kind !== 'notebook' || pinned.id !== id))
			throw new NotFoundError('notebook');

		const q = event.url.searchParams;
		const query = widgetQuery(section, {
			status: q.get('status'),
			order: q.get('order'),
			direction: q.get('direction'),
			tag: q.get('tag'),
			limit: q.get('limit')
		});
		return Response.json(sectionItems(ctx, id, query));
	} catch (e) {
		return toJsonError(e);
	}
};
