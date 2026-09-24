import type { IsolatedEvent } from '$lib/isolated/routes';
import { DASHBOARD_LAYOUT_KEY, parseLayout } from '$lib/dashboard';
import { getUserSetting } from '$lib/services/settings';
import { buildCtx } from '$lib/services/ctx';
import { pickableNotebooks } from '$lib/services/notebooks';
import {
	createEntry,
	createWins,
	deleteEntry,
	listEntries,
	listTags,
	updateEntry
} from '$lib/services/diary';
import { toActionFailure } from '$lib/http-errors';
import { listPeople, peopleForEntries, setEntryPeople } from '$lib/services/people';

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);

	const entries = listEntries(ctx);
	const mentions = peopleForEntries(
		ctx,
		entries.map((e) => e.id)
	);

	return {
		entries: entries.map((e) => ({ ...e, people: mentions.get(e.id) ?? [] })),
		// For the entry form's notebook picker — a note written from the diary
		// can be filed the same way one written from the capture wheel can.
		notebooks: pickableNotebooks(ctx),
		allTags: listTags(ctx),
		allPeople: listPeople(ctx),
		// Three wins is a personal habit, not everyone's: one switch governs it,
		// and it is the dashboard card in preferences. The gate here used to be a
		// feature flag that stopped existing when the dashboard became a layout,
		// which left the composer permanently unreachable.
		winsEnabled: parseLayout(getUserSetting(ctx.userId, DASHBOARD_LAYOUT_KEY)).includes('threeWins')
	};
};

export const actions = {
	create: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			const ctx = buildCtx(locals.user!.id);
			const id = createEntry(ctx, {
				content: formData.get('content'),
				tags: formData.get('tags'),
				notebookId: formData.get('notebookId')
			});
			setEntryPeople(ctx, id, formData.get('people'));
			// The id comes back so a receipt can offer a way straight into it.
			return { success: true, id };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createWins: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		// The form numbers its rows, and can grow one; take them in order until
		// the numbering stops.
		const wins: FormDataEntryValue[] = [];
		for (let i = 0; formData.has(`win_${i}`); i++) wins.push(formData.get(`win_${i}`)!);

		try {
			createWins(buildCtx(locals.user!.id), {
				wins,
				tags: formData.get('tags'),
				forDate: formData.get('forDate')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			const ctx = buildCtx(locals.user!.id);
			const id = Number(formData.get('id'));
			updateEntry(ctx, id, {
				content: formData.get('content'),
				tags: formData.get('tags'),
				notebookId: formData.get('notebookId')
			});
			setEntryPeople(ctx, id, formData.get('people'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			deleteEntry(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
