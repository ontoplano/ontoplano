import { json } from '@sveltejs/kit';
import { stringify } from 'devalue';

/**
 * Say no to a write, in a shape the thing that asked can act on.
 *
 * A hook that refuses a request cannot call `fail()` — that belongs to an
 * action, and the point of refusing here is that the action never runs. But a
 * bare `new Response('no', { status: 403 })` is worse than it looks: nearly
 * every form in the app is `use:enhance`, which reads the body as an action
 * result, so a plain-text refusal reaches the person as
 *
 *     500 · JSON.parse: unexpected character at line 1 column 1
 *
 * rather than as the sentence explaining why. So this returns exactly what
 * SvelteKit returns for a `fail()` inside an action — same envelope, same
 * devalue-encoded payload — and every page that already renders `form.message`
 * or toasts it through `settingsForm` shows the refusal with no further
 * arrangement.
 *
 * Anything that is not an enhanced form (a plugin, curl, a plain submit with
 * scripting off) gets the status and the sentence as text, which is what those
 * callers can read.
 */
export function refuse(request: Request, message: string, status = 403): Response {
	if (request.headers.get('x-sveltekit-action') === 'true') {
		// `refused` is what the root layout watches for, so the sentence is said
		// once, as a toast, on whatever page the form happened to be on.
		return json(
			{ type: 'failure', status, data: stringify({ message, refused: true }) },
			{ status }
		);
	}

	return new Response(`${message}\n`, {
		status,
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}
