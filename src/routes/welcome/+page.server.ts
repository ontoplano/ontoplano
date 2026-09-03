import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULT_THEME, DEFAULT_WEEK, getTheme } from '$lib/server/settings';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import { completeFirstRun, needsFirstRun, TEMPLATES } from '$lib/server/services/onboarding';
import { HIDEABLE_SECTIONS } from '$lib/sections';
import { zoneGroups } from '$lib/timezones';

export const load: PageServerLoad = async ({ locals }) => {
	// Coming back here after setup would offer to seed a second starter week.
	if (!needsFirstRun(locals.user!.id)) redirect(302, '/planner/plan');

	return {
		week: DEFAULT_WEEK,
		// Four hundred entries with today's offsets on them, built where the
		// clock already is.
		zones: zoneGroups(),
		// The rooms somebody can turn off, with the sentence that says what each
		// one is — the same list preferences shows, so the two cannot disagree.
		rooms: HIDEABLE_SECTIONS,
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
	default: async ({ request, locals }) => {
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
				// Skipping is not a choice about rooms: it leaves every one of them
				// on, which is what an account that never saw this page gets.
				rooms: skipped ? undefined : formData.getAll('rooms')
			});
		} catch (e) {
			return toActionFailure(e);
		}

		redirect(303, '/planner/plan?welcome=1');
	}
};
