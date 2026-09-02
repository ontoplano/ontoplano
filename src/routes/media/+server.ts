import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/server/services/ctx';
import { toJsonError, UnauthorizedError } from '$lib/server/services/errors';
import { mediaLimits, store } from '$lib/server/services/media';

/**
 * Somewhere to put a picture, before the writing that mentions it exists.
 *
 * This is an endpoint rather than a page action, and that is a deliberate
 * exception to the rule that pages mutate through actions. The reason is what
 * it is for: pasting a screenshot into a note. The picture has to be stored and
 * given an address *while the person is still typing*, because the address is
 * what goes into the text — so there is no form being submitted, and nothing on
 * the page changes. The entry itself is still saved by an ordinary form action,
 * with the markdown the person can see and edit.
 *
 * Nothing is relaxed by that. The session is required, the ceilings and the
 * type allowlist are the service's, and SvelteKit's origin check covers a
 * `multipart/form-data` POST exactly as it covers a form.
 */
export const POST: RequestHandler = async (event) => {
	try {
		if (!event.locals.user) throw new UnauthorizedError('Sign in first.');

		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) throw new UnauthorizedError('No file in that request.');

		// Read the ceiling before the bytes: a browser that ignored the accept
		// attribute should not get to spend the memory first.
		const limits = mediaLimits();
		if (file.size > limits.maxBytes)
			return Response.json(
				{
					message: `Pictures here are at most ${limits.maxKilobytes}KB, and that one is ${Math.ceil(
						file.size / 1024
					)}KB.`
				},
				{ status: 413 }
			);

		const picture = store(buildCtx(event.locals.user.id), {
			bytes: Buffer.from(await file.arrayBuffer()),
			filename: file.name,
			alt: String(form.get('alt') ?? '')
		});

		return Response.json({
			id: picture.id,
			filename: picture.filename,
			byteSize: picture.byteSize,
			// What to put in the text. Built here so the app has one idea of what a
			// picture looks like in somebody's writing.
			markdown: `![${picture.alt || picture.filename}](/media/${picture.id})`
		});
	} catch (e) {
		return toJsonError(e);
	}
};
