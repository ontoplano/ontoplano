import type { Actions } from './$types';
import type { IsolatedEvent } from '$lib/isolated/routes';
import { toActionFailure } from '$lib/http-errors';
import { deleteTag, listTagsWithUses, recolorTag, renameTag } from '$lib/services/tags';

/**
 * The labels themselves, rather than the things wearing them.
 *
 * Every other room reads tags as a property of what they are on. This is the
 * one page where the vocabulary is the subject: what words the account has,
 * how much work each is doing, and the three things that can be done to one.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	return { tags: listTagsWithUses(locals.user!.id) };
};

export const actions: Actions = {
	/*
	 * What the label is: its word and its colour, saved together.
	 *
	 * One action rather than two, because the dialog asks both questions at
	 * once — and because renaming onto a name the account already uses merges
	 * the two labels, so the colour has to land on whichever one survived.
	 */
	save: async ({ request, locals }) => {
		const formData = await request.formData();
		const userId = locals.user!.id;
		try {
			const after = renameTag(userId, Number(formData.get('id')), formData.get('label'));
			recolorTag(userId, after.id, formData.get('color'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteTag(locals.user!.id, Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
