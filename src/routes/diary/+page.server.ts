import type { Actions, PageServerLoad } from './$types';
import { DASHBOARD_LAYOUT_KEY, parseLayout } from '$lib/dashboard';
import { getUserSetting } from '$lib/server/settings';
import { buildCtx } from '$lib/server/services/ctx';
import {
	createEntry,
	createWins,
	deleteEntry,
	listEntries,
	listTags,
	updateEntry
} from '$lib/server/services/diary';
import { toActionFailure } from '$lib/server/services/errors';
import { listPeople, peopleForEntries, setEntryPeople } from '$lib/server/services/people';
import { pickableNotebooks } from '$lib/server/services/notebooks';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	const entries = listEntries(ctx);
	const mentions = peopleForEntries(
		ctx,
		entries.map((e) => e.id)
	);

	return {
		entries: entries.map((e) => ({ ...e, people: mentions.get(e.id) ?? [] })),
		allTags: listTags(ctx),
		allPeople: listPeople(ctx),
		notebooks: pickableNotebooks(ctx),
		// Three wins is a personal habit, not everyone's: one switch governs it,
		// and it is the dashboard card in preferences. The gate here used to be a
		// feature flag that stopped existing when the dashboard became a layout,
		// which left the composer permanently unreachable.
		winsEnabled: parseLayout(getUserSetting(ctx.userId, DASHBOARD_LAYOUT_KEY)).includes('threeWins')
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const ctx = buildCtx(locals.user!.id);
			const id = createEntry(ctx, {
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

	createWins: async ({ request, locals }) => {
		const formData = await request.formData();
		// The form numbers its rows, and can grow one; take them in order until
		// the numbering stops.
		const wins: FormDataEntryValue[] = [];
		for (let i = 0; formData.has(`win_${i}`); i++) wins.push(formData.get(`win_${i}`)!);

		try {
			createWins(buildCtx(locals.user!.id), {
				wins,
				tags: formData.get('tags'),
				forDate: formData.get('forDate'),
				notebookId: formData.get('notebookId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
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

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteEntry(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
