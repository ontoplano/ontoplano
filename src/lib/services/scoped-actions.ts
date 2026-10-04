import type { Actions, RequestEvent } from '@sveltejs/kit';
import { buildCtx, type Ctx } from './ctx.js';
import { toActionFailure } from '$lib/http-errors';

/** What a form handler needs of the request: the body, and who is signed in. */
export type FormEvent = Pick<RequestEvent, 'request'> & {
	locals: { user?: { id: string } | null };
};

/**
 * A form action: the body read, the account's context built, the service
 * called, and a service's refusal turned into the `fail()` the page shows.
 *
 * Every handler in the app did these four things by hand around one line of
 * its own — two hundred and eighty copies of the same try/catch. What is left
 * to write is the line: which service, with which fields. Returning nothing
 * answers `{ success: true }`; returning something answers with that.
 */
export function formAction<T>(run: (ctx: Ctx, form: FormData, event: FormEvent) => T | Promise<T>) {
	return async (event: FormEvent) => {
		const form = await event.request.formData();
		try {
			const result = await run(buildCtx(event.locals.user!.id), form, event);
			return result === undefined ? { success: true as const } : result;
		} catch (e) {
			return toActionFailure(e);
		}
	};
}

/**
 * A room's handlers, mounted under a prefix.
 *
 * The notebook page answers for every module it can hold, and each module's
 * handlers are the room's own — the Habits tab inside a notebook ticks a habit
 * with the same code the Health room does, or the two screens mean different
 * things by the same button. The plain names belong to the notebook itself, so
 * they are mounted prefixed: `create` becomes `habitCreate`.
 *
 * What the markup posts to is the matching `*-action-names.ts` beside each
 * card — `$lib/habit-action-names`, `$lib/bill-action-names` and the rest —
 * which spell the same names out for the two screens that draw the card.
 */
export function under(prefix: string, handlers: Actions): Actions {
	return Object.fromEntries(
		Object.entries(handlers).map(([verb, handler]) => [
			`${prefix}${verb[0].toUpperCase()}${verb.slice(1)}`,
			handler
		])
	);
}
