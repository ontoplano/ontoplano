import type { Actions } from './$types';
import type { IsolatedEvent } from '$lib/isolated/routes';

import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { audioLimits, defaultAudioName, list, remove, rename } from '$lib/services/audio';
import { createIdea } from '$lib/services/ideas';

/**
 * What the recordings tab needs, and the two things it can do without bytes.
 *
 * The bytes never come through a form action: a `MediaRecorder` hands back a
 * blob that is already exactly what should be stored, and wrapping it in a
 * multipart body to unwrap it again buys nothing. Recording posts to
 * `/media/audio`; renaming and deleting are here, where they have no payload.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const limits = audioLimits();

	return {
		recordings: list(ctx),
		limits: { audioKilobytes: limits.audioKilobytes, accountAudios: limits.accountAudios },
		/*
		 * The name the form offers, worked out here.
		 *
		 * The account's own clock, not the device's, so the placeholder and the
		 * name the service falls back to are the same string — leaving the
		 * field alone and typing what it shows have to be the same act, or the
		 * placeholder is telling somebody something untrue.
		 */
		suggestedName: defaultAudioName(ctx.now, ctx.tz)
	};
};

export const actions: Actions = {
	rename: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			rename(buildCtx(locals.user!.id), Number(form.get('id')), form.get('label'));
			return { success: true, action: 'rename' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	remove: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			remove(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true, action: 'remove' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * The recording, as an idea.
	 *
	 * Saying something into the phone and then having to go to another room,
	 * open a form and reach back for the file is three steps between having a
	 * thought and writing it down — which is the whole thing ideas are for. The
	 * recording is not copied: the idea carries the same markdown link the note
	 * and idea forms already write, so it is one recording with something
	 * pointing at it.
	 */
	toIdea: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			createIdea(buildCtx(locals.user!.id), {
				content: form.get('content'),
				tags: form.get('tags')
			});
			return { success: true, action: 'toIdea' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
