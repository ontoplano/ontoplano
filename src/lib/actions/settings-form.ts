import { enhance } from '$app/forms';
import { notify } from '$lib/notify.svelte';

/**
 * `use:enhance` for a form that SHOWS stored state rather than collecting new
 * input.
 *
 * SvelteKit's `enhance` calls `form.reset()` after a successful submit. That is
 * right for a form you fill in — the fields clear, ready for the next one — and
 * wrong for one whose controls are drawn from `data`, because `reset()` returns
 * every control to its **HTML attribute** default and Svelte sets `checked` and
 * `value` as properties. The attributes say "unchecked", so the whole form
 * empties itself the moment it saves.
 *
 * The Sections list on `/settings/preferences` did exactly that: every box
 * cleared on save, and the page only told the truth again after a reload. The
 * same shape was one submit away on the registration mode, the email-change
 * switch, the client-error switch and the deployment fields.
 *
 * So this is not a note to remember at each of those call sites — it is the
 * thing to reach for whenever a form is a view of something stored. Plain
 * `use:enhance` stays correct for a form that creates something, where clearing
 * the fields is the point.
 */
export function settingsForm(node: HTMLFormElement, options: { notice?: string } = {}) {
	return enhance(node, () => async ({ result, update }) => {
		await update({ reset: false });

		// Said here rather than at the top of the page. A settings page is long,
		// and a confirmation drawn above the first card is invisible to somebody
		// who scrolled to the last one to press the button — which is exactly
		// how the Sections card reported success on a phone.
		if (result.type === 'success' && options.notice) notify.success(options.notice);
		if (result.type === 'failure') {
			const data = result.data as { message?: unknown; refused?: unknown } | undefined;
			// A refusal from a hook is announced by the root layout, for every form
			// in the app at once. Saying it here as well is the same sentence twice.
			if (data?.refused === true) return;
			const said = data?.message;
			notify.error(typeof said === 'string' && said ? said : 'That did not save.');
		}
	});
}
