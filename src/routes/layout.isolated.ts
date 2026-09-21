/**
 * What the shell is told on an isolated instance.
 *
 * `+layout.server.ts` stays the server's answer — sessions, the demo, the
 * staging band, push keys are all questions about a deployment. This is the
 * same shape answered from the device: the one account, its own settings,
 * and honest constants for everything a phone simply is not. Typed against
 * the server load's generated data type, so the two cannot drift without the
 * build saying so.
 */
import { listTags } from '$lib/services/diary';
import type { LayoutServerData } from './$types';
import { redirect } from '@sveltejs/kit';
import type { IsolatedEvent } from '$lib/isolated/routes';
import { profileOf } from '$lib/services/account-profile';
import { listCategories } from '$lib/services/activities';
import { buildCtx } from '$lib/services/ctx';
import {
	getHiddenSections,
	getClock,
	getLocale,
	getNavOrder,
	getSectionColors,
	getTheme,
	getWeekSettings,
	hasSeenTutorial
} from '$lib/services/settings';
import { SOURCE_LOCALE } from '$lib/i18n/locales';
import { list as listSent, unreadCount as unreadSent } from '$lib/services/sent-notifications';
import { DEFAULT_PICTURE_KILOBYTES, DEFAULT_UNDO_SECONDS } from '$lib/instance-defaults';
import { outwardLinks } from '$lib/links';

export async function load(event: IsolatedEvent): Promise<LayoutServerData> {
	const user = profileOf(event.locals.user!.id);
	// The one account is seeded with the database; reaching this without it
	// means the database is broken, and /login at least says so out loud.
	if (!user) redirect(302, '/login');

	const ctx = buildCtx(user.id);
	const vocabulary = listTags(ctx);
	return {
		user,
		/*
		 * The language, which on a device is the account's own or nothing.
		 *
		 * There is no request to read a header off and no operator to have set
		 * an instance default — this *is* the instance. When nobody has chosen,
		 * the shell asks the device itself; see `+layout.ts`.
		 */
		locale: getLocale(user.id) ?? SOURCE_LOCALE,
		// The device's shell and its pages are one build — there is no version
		// for either to fall behind.
		appUpdate: null,
		// Nobody shares a device's instance, so nobody can offer to pay for it.
		familyOffer: null,
		categories: listCategories(ctx).map((c) => ({
			id: c.id,
			name: c.name,
			color: c.color,
			colorLight: c.colorLight
		})),
		theme: getTheme(user.id),
		// Which clock, and which zone — the same two the server instance sends,
		// read off the one account this device has.
		clock: getClock(user.id),
		tz: ctx.tz,
		tagVocabulary: vocabulary.map((one) => one.name),
		// The colours, beside the words — see the server instance's layout.
		tagColors: Object.fromEntries(
			vocabulary.filter((one) => one.color).map((one) => [one.name, one.color as string])
		),
		hiddenSections: getHiddenSections(user.id),
		navOrder: getNavOrder(user.id),
		sectionColors: getSectionColors(user.id),
		/*
		 * What the app has told this person, on a device that told them itself.
		 *
		 * There is no push here — the phone books Android's own alarms — so
		 * nothing writes to this table on a device yet, and the list is empty
		 * and the badge is zero. Answered anyway, because the shell draws the
		 * same bell either way and a missing field is a crash rather than an
		 * empty list.
		 */
		notifications: listSent(buildCtx(user.id)),
		unreadNotifications: unreadSent(buildCtx(user.id)),
		demo: false,
		staging: false,
		// The copy on the device is the app itself, with the app's own name.
		appName: 'Ontoplano',
		tutorialPending: !hasSeenTutorial(user.id),
		// Push arrives through the device, not through a push service.
		pushKey: null,
		config: { week: getWeekSettings(user.id) },
		// The documentation and the front page are on the web whether or not
		// this copy of the app ever reaches it.
		links: outwardLinks(),
		undoSeconds: DEFAULT_UNDO_SECONDS,
		maxPictureKilobytes: DEFAULT_PICTURE_KILOBYTES,
		// An isolated instance has nowhere to send an error report.
		clientErrorReports: 'off'
	};
}
