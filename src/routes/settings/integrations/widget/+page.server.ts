import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { NotFoundError } from '$lib/services/errors';
import { createToken } from '$lib/server/services/tokens';
import {
	createPhoneWidget,
	deletePhoneWidget,
	listPhoneWidgets,
	updatePhoneWidget
} from '$lib/server/services/phone-widgets';
import { listNotebooks } from '$lib/services/notebooks';
import { tagsByNotebook } from '$lib/services/tags';
import { WIDGET_SECTION_IDS, type WidgetSection } from '$lib/notebook-widget';

/**
 * Where the phone's widgets are set up, and listed.
 *
 * Two kinds. The Today widget connects itself with one key that reads today.
 * A notebook widget shows one tab of one notebook, and its choices live here
 * — the phone holds only its key — so they can be changed from any screen.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	const tags = tagsByNotebook(ctx.userId);
	return {
		widgets: listPhoneWidgets(ctx),
		// Every notebook, with the tabs a widget could show of it.
		notebooks: listNotebooks(ctx)
			.map((one) => ({
				id: one.id,
				title: one.title,
				sections: one.modules.filter((m): m is WidgetSection =>
					(WIDGET_SECTION_IDS as string[]).includes(m)
				),
				tags: tags[one.id] ?? []
			}))
			.filter((one) => one.sections.length > 0)
	};
};

function fields(data: FormData): Record<string, unknown> {
	return Object.fromEntries(data.entries());
}

export const actions: Actions = {
	connect: async ({ locals, url }) => {
		const ctx = buildCtx(locals.user!.id);

		try {
			// `today:read` and nothing else: a widget sitting on a lock screen
			// should not carry a key to the diary — and not to the habits either,
			// which is why they are `habits:read` now rather than part of this.
			const token = createToken(ctx, { name: 'Phone widget', scopes: ['today:read'] });
			return { success: true, token: token.plaintext, origin: url.origin };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * A notebook widget, and its key — handed back once, for the phone that
	 * asked (`slot` is the widget's number on that phone's home screen).
	 */
	createWidget: async ({ locals, request, url }) => {
		const ctx = buildCtx(locals.user!.id);
		const data = await request.formData();
		try {
			const made = createPhoneWidget(ctx, fields(data));
			return {
				created: {
					id: made.id,
					token: made.token,
					origin: url.origin,
					slot: String(data.get('slot') ?? '')
				}
			};
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateWidget: async ({ locals, request, url }) => {
		const ctx = buildCtx(locals.user!.id);
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!Number.isInteger(id) || id <= 0) return toActionFailure(new NotFoundError('widget'));
		try {
			updatePhoneWidget(ctx, id, fields(data));
			return { updated: { id, origin: url.origin, slot: String(data.get('slot') ?? '') } };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteWidget: async ({ locals, request }) => {
		const ctx = buildCtx(locals.user!.id);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id <= 0) return toActionFailure(new NotFoundError('widget'));
		try {
			deletePhoneWidget(ctx, id);
			return { deleted: id };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
