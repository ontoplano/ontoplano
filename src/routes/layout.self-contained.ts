/**
 * What the shell is told on a self-contained instance.
 *
 * `+layout.server.ts` stays the server's answer — sessions, the demo, the
 * staging band, push keys are all questions about a deployment. This is the
 * same shape answered from the device: the one account, its own settings,
 * and honest constants for everything a phone simply is not. Typed against
 * the server load's generated data type, so the two cannot drift without the
 * build saying so.
 */
import type { LayoutServerData } from './$types';
import { redirect } from '@sveltejs/kit';
import type { SelfContainedEvent } from '$lib/self-contained/routes';
import { profileOf } from '$lib/services/account-profile';
import { listCategories } from '$lib/services/activities';
import { buildCtx } from '$lib/services/ctx';
import {
	getHiddenSections,
	getNavOrder,
	getSectionColors,
	getTheme,
	getWeekSettings,
	hasSeenTutorial
} from '$lib/services/settings';
import { DEFAULT_PICTURE_KILOBYTES, DEFAULT_UNDO_SECONDS } from '$lib/instance-defaults';

export async function load(event: SelfContainedEvent): Promise<LayoutServerData> {
	const user = profileOf(event.locals.user!.id);
	// The one account is seeded with the database; reaching this without it
	// means the database is broken, and /login at least says so out loud.
	if (!user) redirect(302, '/login');

	const ctx = buildCtx(user.id);
	return {
		user,
		// Nobody shares a device's instance, so nobody can offer to pay for it.
		familyOffer: null,
		categories: listCategories(ctx).map((c) => ({
			id: c.id,
			name: c.name,
			color: c.color,
			colorLight: c.colorLight
		})),
		theme: getTheme(user.id),
		hiddenSections: getHiddenSections(user.id),
		navOrder: getNavOrder(user.id),
		sectionColors: getSectionColors(user.id),
		demo: false,
		staging: false,
		tutorialPending: !hasSeenTutorial(user.id),
		demoHost: null,
		// Push arrives through the device, not through a push service.
		pushKey: null,
		config: { week: getWeekSettings(user.id) },
		undoSeconds: DEFAULT_UNDO_SECONDS,
		maxPictureKilobytes: DEFAULT_PICTURE_KILOBYTES,
		// A self-contained instance has nowhere to send an error report.
		clientErrorReports: 'off'
	};
}
