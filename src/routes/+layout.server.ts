import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Clock } from '$lib/when';
import { serverTimezone } from '$lib/services/ctx';
import { listTags } from '$lib/services/diary';
import {
	DEFAULT_THEME,
	DEFAULT_WEEK,
	getHiddenSections,
	getNavOrder,
	getSectionColors,
	getTheme,
	getWeekSettings,
	hasSeenTutorial,
	isDemo as isDemoInstance,
	isStaging,
	appName,
	getClock
} from '$lib/server/settings';
import type { HideableSection } from '$lib/sections';
import { clientErrorState } from '$lib/server/services/client-errors';
import { needsFirstRun } from '$lib/services/onboarding';
import { listCategories } from '$lib/services/activities';
import { buildCtx } from '$lib/services/ctx';
import { isDemoAccount } from '$lib/server/services/demo';
import {
	list as listSent,
	unreadCount as unreadSent,
	type Sent as SentNotification
} from '$lib/services/sent-notifications';
import { loadConfig } from '$lib/server/config';
import { outwardLinks } from '$lib/links';
import { mediaLimits } from '$lib/services/media';
import { publicKey } from '$lib/server/services/push';
import { build } from '$lib/server/services/version';
import { appBehindInstance } from '$lib/platform';
import { invitationFor } from '$lib/server/services/subscriptions';
import { SOURCE_LOCALE } from '$lib/i18n/locales';

export const load: LayoutServerLoad = async (event) => {
	// Anything under /login, not just /login itself — /login/reset is where a
	// password-reset link lands, and by definition its visitor is signed out.
	const isLoginPage = event.url.pathname === '/login' || event.url.pathname.startsWith('/login/');
	// The offline fallback has to render without a session check — reaching it
	// means the network is down, so there is nothing to check against.
	const isOffline = event.url.pathname === '/offline';
	const isAuthApi = event.url.pathname.startsWith('/api/auth');
	// The policies have to be readable by somebody deciding whether to sign up,
	// which is exactly somebody who is not signed in.
	const isLegal = event.url.pathname.startsWith('/legal');
	// The front page is the pitch when nobody is signed in. Sending a stranger
	// straight to a sign-in form asks them to commit before they know what this
	// is, which is the shortest possible funnel and the wrong one.
	const isFrontPage = event.url.pathname === '/';
	// A one-click unsubscribe has to work from a mail client, which has no
	// session and never will — that is what makes it one click. It is signed;
	// see `services/review-mail.ts`.
	const isMailLink = event.url.pathname.startsWith('/mail/');
	// Confirming and unsubscribing: the person on the other end of a newsletter
	// has no account here and may never have one.
	const isNewsletter = event.url.pathname.startsWith('/newsletter/');
	// The demo's waiting room is where an account is made, so by definition
	// nobody is signed in while it is drawn. It 404s off a demo instance.
	const isDemoDoor = event.url.pathname === '/demo';
	/*
	 * The screen an assistant sends somebody to, which answers its own door.
	 *
	 * Signing in is part of what it is for, and it has somewhere to send them
	 * afterwards — the consent screen they were already walking towards. This
	 * blanket redirect drops that, so the page is left to do it: see
	 * `oauth/authorize`, which sends them to `/login?next=…` and gets them
	 * back. Everything else still lands on a bare login page.
	 */
	const isConnect = event.url.pathname === '/oauth/authorize';

	if (
		!event.locals.user &&
		!isLoginPage &&
		!isAuthApi &&
		!isOffline &&
		!isLegal &&
		!isFrontPage &&
		!isMailLink &&
		!isNewsletter &&
		!isDemoDoor &&
		!isConnect
	) {
		return redirect(302, '/login');
	}

	// A new account meets first run before anything else: an empty grid is what
	// a stranger churns on. It asks twice for a timezone and a starting week,
	// then never appears again.
	// /welcome and what sits under it — the set-password step included, or the
	// gate and the page would bounce a fresh invited account between them.
	const isWelcome = event.url.pathname === '/welcome' || event.url.pathname.startsWith('/welcome/');
	// The hold pages sit outside first-run on purpose: the gates in
	// hooks.server.ts bounce /welcome to them, and first-run sending the
	// visitor back again is a loop, not an onboarding.
	const isVerifyHold = ['/login/verify', '/start', '/buy'].includes(event.url.pathname);
	if (
		event.locals.user &&
		!isWelcome &&
		!isVerifyHold &&
		!isAuthApi &&
		!event.url.pathname.startsWith('/api/') &&
		needsFirstRun(event.locals.user.id)
	) {
		return redirect(302, '/welcome');
	}

	let userCategories: { id: number; name: string; color: string; colorLight: string }[] = [];
	let theme = DEFAULT_THEME;
	let clock: Clock = 'auto';
	/* The account's zone, so every screen writes a time in the same one. */
	let tz = serverTimezone();
	/* Every tag this account has used — one vocabulary, so the shell carries it. */
	let tagVocabulary: string[] = [];
	/*
	 * The colour each label wears, by name.
	 *
	 * Beside the vocabulary rather than on the pages, for the same reason the
	 * vocabulary itself is here: the same word is drawn on a task, a note, an
	 * idea and a picture, and a colour plumbed through four loaders is a
	 * colour that shows in three of them. `TagChip` reads this.
	 */
	let tagColors: Record<string, string> = {};
	let week = DEFAULT_WEEK;
	let hiddenSections: HideableSection[] = [];
	let navOrder: string[] = [];
	let sectionColors: Record<string, string> = {};
	let tutorialPending = false;
	/*
	 * What the app has told this account, and how much of it is unread.
	 *
	 * In the shell rather than on a page, because the badge is in the shell:
	 * the bell in the header and the dot on the account button are the same
	 * number seen from two places, and a page loading it would mean the number
	 * only being right on the pages that thought to ask.
	 */
	let notifications: SentNotification[] = [];
	let unreadNotifications = 0;
	let resettableDemo = false;
	if (event.locals.user) {
		const ctx = buildCtx(event.locals.user.id);
		userCategories = listCategories(ctx).map((c) => ({
			id: c.id,
			name: c.name,
			color: c.color,
			colorLight: c.colorLight
		}));
		theme = getTheme(ctx.userId);
		clock = getClock(ctx.userId);
		tz = ctx.tz;
		const vocabulary = listTags(ctx);
		tagVocabulary = vocabulary.map((one) => one.name);
		tagColors = Object.fromEntries(
			vocabulary.filter((one) => one.color).map((one) => [one.name, one.color as string])
		);
		week = getWeekSettings(ctx.userId);
		hiddenSections = getHiddenSections(ctx.userId);
		navOrder = getNavOrder(ctx.userId);
		sectionColors = getSectionColors(ctx.userId);
		notifications = listSent(ctx);
		unreadNotifications = unreadSent(ctx);
		/*
		 * The demo is everybody's first visit.
		 *
		 * Its accounts are handed out one per visitor and thrown away, so there
		 * is nothing worth storing and nothing to be gained by asking — the tour
		 * is the point of the demo. Everywhere else it is the flag, which is
		 * written once and never again.
		 */
		tutorialPending = isDemoInstance() || !hasSeenTutorial(ctx.userId);
		resettableDemo = isDemoInstance() && isDemoAccount(ctx.userId);
	}

	/*
	 * A family plan offering to pay for this account.
	 *
	 * On every page rather than on the billing tab, because it is a question
	 * somebody else asked about this account and the answer is not urgent
	 * enough to visit a settings page for — and until it is answered nothing
	 * has changed, which is exactly the state a band is for.
	 */
	const familyOffer = event.locals.user ? invitationFor(event.locals.user.id) : null;

	/*
	 * An installed app that has fallen behind this instance.
	 *
	 * The pages are always the instance's — they came from it — but the shell
	 * around them updates on the store's schedule, and a shell a minor behind
	 * can meet a page that assumes a bridge it does not have. Named versions
	 * rather than a sentence about them, so the person can see exactly how far
	 * behind they are; null for a browser, an isolated instance (its shell and
	 * pages are one build), and ordinary patch drift.
	 */
	const instanceVersion = build().version;
	const appUpdate =
		event.locals.nativeAppVersion &&
		appBehindInstance(event.locals.nativeAppVersion, instanceVersion)
			? { app: event.locals.nativeAppVersion, instance: instanceVersion }
			: null;

	return {
		appUpdate,
		user: event.locals.user ?? null,
		familyOffer,
		categories: userCategories,
		theme,
		/*
		 * The language this page is in.
		 *
		 * Resolved by the hook that stamps it into `<html lang>`, so the
		 * document's own declaration and the words in it cannot disagree. The
		 * universal load beside this one turns it into a catalogue.
		 */
		locale: event.locals.locale ?? SOURCE_LOCALE,
		/*
		 * Which clock this account reads. On the shell rather than on a page,
		 * because every room writes a time and they have to agree — see
		 * `$lib/when`.
		 */
		clock,
		tz,
		tagVocabulary,
		tagColors,
		// Sections this account has put away: out of every menu the shell
		// renders, still answering at their URLs.
		hiddenSections,
		// The order this account keeps its rooms in, and the colours it has
		// changed. Both are the shell's business rather than a page's, so they
		// arrive here — the bar, the pie and the palette are three renderings of
		// one list and have to agree about it.
		navOrder,
		sectionColors,
		notifications,
		unreadNotifications,
		// The public demo says so on every page: a copy of your own, deleted
		// hourly, so nobody mistakes it for their own instance.
		demo: isDemoInstance(),
		/*
		 * And whether *this* account is one of the throwaway copies.
		 *
		 * Not the same question as the one above, which is why the menu used to
		 * offer Reset demo account to the operator signed into their own
		 * account on the demo instance — and resetting refuses that, correctly,
		 * so the button was one that could only fail. Only a visitor's own copy
		 * can be put back.
		 */
		demoAccount: resettableDemo,
		/*
		 * And so does staging, on every page rather than only on the way in.
		 *
		 * It used to say so on the sign-in form and nowhere else, so the moment
		 * somebody was signed in the copy was indistinguishable from the real
		 * instance — which is the state in which a real week gets typed into it.
		 * This is the only thing in the app that asks which instance it is, and
		 * all it does is draw a band.
		 */
		staging: isStaging(),
		/*
		 * What this instance calls itself, for the browser tab.
		 *
		 * The same name `hooks.server.ts` stamps into `<title>` — staging, the
		 * demo and a dev build each wear their own, and the shell writing a
		 * title per page must not undo that.
		 */
		appName: appName(),
		// Whether to show somebody around without being asked. The shell decides
		// where — the dashboard, which is where first run lets go of them.
		tutorialPending,
		/*
		 * The key a browser needs to sign itself up for notifications.
		 *
		 * Public by definition — it is what the browser hands to its own push
		 * service so that only this instance can address the subscription that
		 * comes back — and null on an instance with no keys, which is how the UI
		 * knows not to offer something that cannot work.
		 */
		pushKey: event.locals.user ? publicKey() : null,
		// The week is the user's, not the instance's.
		config: { week },
		/*
		 * Where the shell's outward links go.
		 *
		 * An instance somebody else runs has its own documentation and its own
		 * front page, so the two addresses come from `config.toml` rather than
		 * being typed into the components that link to them.
		 */
		links: outwardLinks(loadConfig().instance.docsUrl, loadConfig().instance.siteUrl),
		// How long a delete waits before it happens. The instance's call.
		undoSeconds: loadConfig().ui.undoSeconds,
		/*
		 * The biggest picture this instance takes, so the browser can refuse one
		 * before sending it.
		 *
		 * The server refuses it too — that is where the rule lives — but a
		 * refusal that arrives after a megabyte has gone up a phone's uplink is a
		 * refusal that took ten seconds to say no. Worse, an over-large body is
		 * rejected by the Node adapter before any of this app's code runs, and
		 * what comes back is not the JSON a form is waiting for.
		 */
		maxPictureKilobytes: mediaLimits().maxKilobytes,
		// Whether the page may offer to send client-side errors: 'off' unless
		// the instance enabled it, then the account's own once-asked answer.
		/*
		 * Signed out, the instance switch is the whole answer.
		 *
		 * This was `'off'` for anybody without a session, which meant the landing
		 * page could not offer to report its own crash — on the one page a
		 * stranger sees. There is no stored preference to consult for somebody
		 * with no account, so the error page asks, and nothing is sent unless
		 * they press it.
		 */
		clientErrorReports: event.locals.user
			? clientErrorState(event.locals.user.id)
			: loadConfig().reports.clientErrors
				? ('ask' as const)
				: ('off' as const)
	};
};
