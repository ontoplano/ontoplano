import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { UnauthorizedError } from '$lib/services/errors';
import { toJsonError } from '$lib/http-errors';
import { audioLimits, store } from '$lib/services/audio';

/**
 * A recording, posted as bytes.
 *
 * Not a form action, because what a `MediaRecorder` hands back is already
 * exactly the bytes to store — wrapping it in a multipart body to unwrap it
 * again buys nothing and costs a copy. `multipart/form-data` is still what
 * arrives, for the same reason the picture endpoint beside this takes it:
 * SvelteKit's origin check covers it exactly as it covers a form, so a page on
 * another site cannot post here with somebody's cookie.
 *
 * Everything the request says about what it is sending is ignored. The name is
 * rewritten, the type is read off the bytes, and both ceilings are counted from
 * the database. See `services/audio.ts`.
 */
export const POST: RequestHandler = async (event) => {
	try {
		if (!event.locals.user) throw new UnauthorizedError('Sign in first.');

		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) throw new UnauthorizedError('No recording in that request.');

		// The ceiling before the bytes: a page that ignored the limit does not
		// get to spend this process's memory finding out that it did.
		const limits = audioLimits();
		if (file.size > limits.audioBytes)
			return Response.json(
				{
					message: `Recordings here are at most ${limits.audioKilobytes}KB, and that one is ${Math.ceil(
						file.size / 1024
					)}KB.`
				},
				{ status: 413 }
			);

		const held = await store(buildCtx(event.locals.user.id), {
			bytes: new Uint8Array(await file.arrayBuffer()),
			name: String(form.get('name') ?? '')
		});

		return Response.json({
			id: held.id,
			name: held.name,
			byteSize: held.byteSize,
			createdAt: held.createdAt,
			/*
			 * What to put in a note that carries this recording.
			 *
			 * The same shape a picture gets, so one habit covers both: a
			 * markdown link whose target is the row. A note renders it as a
			 * player rather than a link — see `Markdown.svelte`.
			 */
			markdown: `[audio:${held.id}](/media/audio/${held.id})`
		});
	} catch (e) {
		return toJsonError(e);
	}
};
