import { enhance } from '$app/forms';

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
export function settingsForm(node: HTMLFormElement) {
	return enhance(
		node,
		() =>
			async ({ update }) =>
				update({ reset: false })
	);
}
