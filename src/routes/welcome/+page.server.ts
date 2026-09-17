import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULT_THEME, DEFAULT_WEEK, getTheme } from '$lib/server/settings';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { completeFirstRun, needsFirstRun, TEMPLATES } from '$lib/services/onboarding';
import { passwordPending } from '$lib/server/services/family-invite';
import { createToken } from '$lib/server/services/tokens';
import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import { HIDEABLE_ROOMS } from '$lib/sections';
import { zoneGroups } from '$lib/timezones';
import { setUserLanguage } from '$lib/services/preferences';

export const load: PageServerLoad = async ({ locals, url }) => {
	// An account minted by a family invitation chooses its password first —
	// its only credential so far is one nobody knows.
	if (passwordPending(locals.user!.id)) redirect(302, '/welcome/password');

	// Coming back here after setup would offer to seed a second starter week.
	if (!needsFirstRun(locals.user!.id)) redirect(302, '/tasks/plan');

	return {
		// For the assistant step's prompt: this instance's own address, because
		// a self-hosted copy is not app.ontoplano.com.
		origin: url.origin,
		week: DEFAULT_WEEK,
		// Four hundred entries with today's offsets on them, built where the
		// clock already is.
		zones: zoneGroups(),
		// The rooms somebody can turn off, with the sentence that says what each
		// one is — the same list preferences shows, so the two cannot disagree.
		rooms: HIDEABLE_ROOMS,
		theme: getTheme(locals.user!.id) ?? DEFAULT_THEME,
		templates: TEMPLATES.map((t) => ({
			key: t.key,
			label: t.label,
			description: t.description,
			blocks: t.blocks.length
		}))
	};
};

export const actions: Actions = {
	/*
	 * The wizard's first step: a token for an assistant, in one press.
	 *
	 * The scopes are the preset the integrations page offers — read from the
	 * tools themselves — and the plaintext rides back once, inside the prompt
	 * the step shows. Its own form on the page, so pressing it never submits
	 * the wizard.
	 */
	assistantToken: async ({ locals }) => {
		try {
			const token = createToken(buildCtx(locals.user!.id), {
				name: 'AI assistant',
				scopes: ASSISTANT_SCOPES
			});
			return { success: true, assistantToken: token.plaintext };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/*
	 * The language, stored the moment it is chosen rather than at the end.
	 *
	 * The rest of the wizard is answered in whatever language it is being read
	 * in, so the choice has to apply to the page it is made on — and the only
	 * way the shell re-renders in another language is for the server to resolve
	 * it, which means it has to be saved. `finish` sends it again, which is
	 * harmless and covers somebody who never opened this step.
	 */
	setLanguage: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			setUserLanguage(buildCtx(locals.user!.id), formData.get('language'));
			return { success: true, action: 'setLanguage' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/*
	 * Named, not `default`: a page cannot mix a default action with named
	 * ones, and the assistant-token action above is named. Every form that
	 * finishes the wizard posts here explicitly.
	 */
	finish: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			// "Skip" is the same submission with the empty week, under its own name:
			// a submit button called `template` would be sent alongside the radio
			// rather than instead of it.
			const skipped = formData.get('skip') !== null;

			completeFirstRun(buildCtx(locals.user!.id), {
				timezone: formData.get('timezone'),
				firstDay: formData.get('firstDay'),
				generateDay: formData.get('generateDay'),
				template: skipped ? 'blank' : formData.get('template'),
				theme: formData.get('theme'),
				language: formData.get('language'),
				// Skipping is not a choice about rooms: it leaves every one of them
				// on, which is what an account that never saw this page gets.
				rooms: skipped ? undefined : formData.getAll('rooms')
			});
		} catch (e) {
			return toActionFailure(e);
		}

		redirect(303, '/tasks/plan?welcome=1');
	}
};
