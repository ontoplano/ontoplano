<script lang="ts">
	import './layout.css';
	// Generated beside the masks it names: scripts/build-eink-masks.mjs.
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { live } from '$lib/live';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { isIsolatedBuild } from '$lib/isolated/mode';
	import { provideT, translator } from '$lib/i18n';
	import { markUntranslated } from '$lib/i18n/untranslated';
	import type { LayoutData } from './$types';
	import { NAV_DROPDOWN_ITEM, SECTIONS, sectionFor } from '$lib/colors.js';
	import { NAV_PLACES } from '$lib/sections-nav';
	import { accentsWith, placesFor } from '$lib/nav-order';
	import { provideSwipeSurface } from '$lib/swipe-surface';
	import {
		holdHeight,
		landOn,
		releaseHeight,
		slideAway,
		slideOn,
		slidesHere,
		stopHiding
	} from '$lib/slide';
	import { MARK_CLIP_PATH, MARK_FIELD } from '$lib/logo/mark-shape';
	import { MARK_FIELD_ISOLATED } from '$lib/logo/brand';
	import { CHOOSE_PATH, inPhoneApp, storedChoice } from '$lib/instance-choice';
	import { handOverRingerKey } from '$lib/ringer-handshake';
	import { THEMES } from '$lib/theme.js';
	import type { SectionKey } from '$lib/colors.js';
	import SectionPattern from '$lib/components/SectionPattern.svelte';
	import HelpDock from '$lib/components/HelpDock.svelte';
	import Tutorial from '$lib/components/Tutorial.svelte';
	import CapturePie from '$lib/components/CapturePie.svelte';
	import NavPie from '$lib/components/NavPie.svelte';
	import FanMenu, { type Petal } from '$lib/components/FanMenu.svelte';
	import ReportDialog from '$lib/components/ReportDialog.svelte';
	import Tooltips from '$lib/components/Tooltips.svelte';
	import { hasTutorial } from '$lib/tutorials';
	import Logo from '$lib/components/Logo.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import NotificationPanel from '$lib/components/NotificationPanel.svelte';
	import Reminders from '$lib/components/Reminders.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import Notifications from '$lib/components/Notifications.svelte';
	import { notify } from '$lib/notify.svelte';
	import ClientErrorPrompt from '$lib/components/ClientErrorPrompt.svelte';
	import { undo } from '$lib/undo.svelte';
	import { palette } from '$lib/palette.svelte';
	import type { IconName } from '$lib/components/Icon.svelte';
	import { suppressAutofill } from '$lib/autofill';
	import { APP_UPDATE_HUSH_KEY } from '$lib/platform';
	import { startMarkSpin, stopMarkSpin } from '$lib/mark-spin';
	import { smartNumberFields } from '$lib/number-fields';
	import type { Snippet } from 'svelte';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	/*
	 * The update warning can be put away, per instance version: "not now" said
	 * to 0.174.0 holds until the instance moves past it. Read in an effect
	 * rather than at init so the server and the first client render agree, and
	 * a storage that throws (private mode) leaves the warning standing, which
	 * is the safe way round.
	 */
	let updateHushed = $state(false);
	$effect(() => {
		if (!data.appUpdate) return;
		try {
			updateHushed = localStorage.getItem(APP_UPDATE_HUSH_KEY) === data.appUpdate.instance;
		} catch {
			updateHushed = false;
		}
	});
	function hushUpdate() {
		updateHushed = true;
		try {
			localStorage.setItem(APP_UPDATE_HUSH_KEY, data.appUpdate!.instance);
		} catch {
			// Nowhere to remember it: it comes back next launch, which is fair.
		}
	}

	/*
	 * First launch on a phone asks where your ontoplano lives.
	 *
	 * Through the router rather than through the address bar: the app's own
	 * files are served by the shell, which has no `/instance` file to hand over
	 * — a `location.replace` to it is a white screen on the first launch of
	 * every fresh install. `goto` is a client-side move between screens this
	 * build already carries, which is what this always was.
	 *
	 * Only in the phone app, only on the copy it carries, and only while
	 * nothing has been chosen: `storedChoice()` is written the moment somebody
	 * answers, so this runs once in the life of an install.
	 */
	$effect(() => {
		if (!onDevice || !inPhoneApp() || storedChoice()) return;
		if (page.url.pathname.startsWith(CHOOSE_PATH)) return;
		goto(resolve(CHOOSE_PATH as '/instance'));
	});

	/*
	 * A phone that opened this instance and cannot ring for it yet.
	 *
	 * The launch asked; this answers, once, and only where there is a session
	 * to answer with. See `$lib/ringer-handshake` for why it has to happen on
	 * this side and end up on the other.
	 */
	$effect(() => {
		if (!data.user) return;
		void handOverRingerKey(page.url);
	});

	// Autofill is opt-in: see $lib/autofill. Once, for every form the app ever mounts.
	$effect(() => suppressAutofill(document.body));
	// And once for every number box: clicking one selects what is in it, so
	// typing 2 into a field showing 0 gives 2 rather than 02.
	$effect(() => smartNumberFields(document));
	/*
	 * Every word under this point, in the language this page is in.
	 *
	 * Set once for the whole tree rather than passed down, and from the load's
	 * answer rather than from module state — a server renders for several
	 * people at a time and a module-level "current language" is one visitor's
	 * answer leaking into another's page.
	 */
	const t = $derived(translator(data.locale, data.catalogue, data.borrowed));
	provideT(() => t);

	/*
	 * And on a build that is not the real one, the ones still in English are
	 * marked so they read red. `data.borrowed` is only ever set by dev and
	 * staging, so this is the whole of the check.
	 */
	$effect(() => {
		if (!data.borrowed?.size) return;
		return markUntranslated();
	});

	/** This app is its own instance: no account, and leaving means choosing another. */
	const onDevice = $derived(isIsolatedBuild());
	/**
	 * The bar's own colour, and the ground the mark rises out of it on.
	 *
	 * Two colours rather than one: the bar is the bar on either instance, and
	 * the only thing the device's copy paints differently is the mark's own
	 * field — the ground inside the octagon, which is the mark's and not the
	 * bar's. Painting the whole bar with it turned the phone blue, which is a
	 * great deal more than "this is the copy on the device".
	 */
	const barField = MARK_FIELD;
	const markField = $derived(onDevice ? MARK_FIELD_ISOLATED : MARK_FIELD);
	let menuOpen = $state(false);
	let pie = $state<CapturePie | undefined>();
	let rooms = $state<NavPie | undefined>();

	/*
	 * The five small things, fanned above the thumb.
	 *
	 * They were a square `?` docked in the corner of every phone screen, over
	 * whatever was underneath it, plus an account button beside it in the bar.
	 * Both are now one press on the account button: the fan flies up above the
	 * finger and is chosen the way the wheel is — drag onto one and let go, or
	 * lift and tap. The dock stays on a wide screen, where a corner is a corner
	 * and not a third of the room.
	 */
	let fanOpen = $state(false);
	let fanOrigin = $state({ x: 0, y: 0 });
	let fanDragging = $state(false);
	let reporting = $state(false);
	/** Whether the phone is showing the list of what the app has said. */
	let phoneNotifications = $state(false);

	const fanItems = $derived.by(() => {
		const items: Petal[] = [
			{
				key: 'account',
				label: 'app.account',
				icon: 'user'
			},
			/*
			 * What the app has told you, second because it is the one with news.
			 *
			 * The bar's own account button wears a plain dot when anything is
			 * waiting — out there a number is smaller than the thing it counts —
			 * and the count is here, on the petal that leads to the list.
			 */
			{
				key: 'notifications',
				label: 'notifications.title',
				icon: 'bell',
				waiting: data.unreadNotifications ?? 0
			},
			{
				key: 'tutorial',
				label: hasTutorial(page.url.pathname) ? 'fan.showMeAround' : 'fan.noTourForThisScreen',
				icon: 'help'
			}
		];
		// Nobody to tell on a device that is its own instance: there is no
		// operator behind it and nowhere for the message to go.
		if (!onDevice) items.push({ key: 'report', label: 'app.tellTheOperator', icon: 'bug' });
		items.push({ key: 'docs', label: 'app.documentation', icon: 'book' });
		items.push({ key: 'support', label: 'app.supportOntoplano', icon: 'heart' });
		return items;
	});

	function summonFan(e: PointerEvent) {
		// Take the gesture before the browser can, the way the wheel does: a
		// press-and-hold that becomes a text selection never sends the release
		// that would have chosen a petal.
		e.preventDefault();
		(e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
		fanOrigin = { x: e.clientX, y: e.clientY };
		fanDragging = e.pointerType !== 'mouse' || e.button === 0;
		fanOpen = true;
	}

	function chooseFan(key: string) {
		fanOpen = false;
		if (key === 'account') {
			// The same screen either way. A device has one now — its data out, its
			// data in, and the end of the instance — and leaving for another
			// instance is on it, which on a phone is the only door there is.
			goto(resolve('/settings/account'));
			return;
		}
		if (key === 'notifications') {
			phoneNotifications = true;
			return;
		}
		if (key === 'tutorial') {
			tour?.start(true);
			return;
		}
		if (key === 'report') {
			reporting = true;
			return;
		}
		// The two that leave the app, in a tab of their own.
		const away = key === 'docs' ? data.links.docs : data.links.support;
		window.open(away, '_blank', 'noopener');
	}
	let pieOpen = $state(false);
	let roomsOpen = $state(false);

	function categoryStyle(): string {
		return data.categories
			.map(
				(c: { id: number; name: string; color: string; colorLight: string }) =>
					`--color-cat-${c.id}:${c.color};--color-cat-${c.id}-light:${c.colorLight}`
			)
			.join(';');
	}

	/**
	 * The tabs, from the same list the pie's wedges come from.
	 *
	 * They used to be two lists — ten here, eight there — so Notebooks and
	 * People sat in the bar and were simply absent from the pie whatever the
	 * preferences said. `sections-nav.test.ts` keeps them the same list.
	 */
	/*
	 * In this account's order, and this account's colours.
	 *
	 * `placesFor` is the one place either preference is applied — it drops a key
	 * for a room the app no longer has and keeps a room the stored order has
	 * never heard of, so neither an old preference nor a new room can leave a
	 * hole in somebody's menu.
	 */
	const allNav = $derived(
		placesFor(NAV_PLACES, { order: data.navOrder, colors: data.sectionColors })
	);

	/** Every section's colour, the account's where it has chosen one. */
	const accents = $derived(accentsWith(data.sectionColors));

	/**
	 * The tabs this account actually shows. Hiding is a menu matter only —
	 * the routes behind a hidden tab keep answering, so a bookmark or a link
	 * into a hidden section still works.
	 */
	const nav = $derived(
		allNav.filter((item) => !item.hide || !data.hiddenSections.includes(item.hide))
	);

	/**
	 * Screens that carry no navigation.
	 *
	 * First run, because every other page bounces straight back to it until it
	 * is done. The policies, because they have to read the same whether or not
	 * anybody is signed in. And the instance screen, because until it has been
	 * answered there is no instance for a nav bar to be about: every room on it
	 * belongs to whichever ontoplano you have not chosen yet, and pressing one
	 * leaves by a door with no way back.
	 */
	const bareScreen = $derived(
		['/login/verify', '/start', '/buy', CHOOSE_PATH].includes(page.url.pathname) ||
			page.url.pathname.startsWith('/welcome') ||
			page.url.pathname.startsWith('/legal') ||
			/*
			 * Anything the newsletter's own links land on.
			 *
			 * Somebody following "stop these" out of a message is not a person
			 * using the app — they may have no account at all — and drawing the
			 * bar, the wheel and the rooms around a single sentence offers them
			 * a way into something they never asked for. One page, one thing
			 * said, and a door out if they want one.
			 */
			page.url.pathname.startsWith('/newsletter')
	);

	/** The section being viewed. Its accent fills the active nav tab. */
	const sectionKey = $derived(sectionFor(page.url.pathname));
	const section = $derived({ ...SECTIONS[sectionKey], accent: accents[sectionKey] });

	/** The glyph tiled behind the page, from the same table as the nav icons. */
	const SECTION_GLYPH: Record<SectionKey, IconName> = {
		home: 'home',
		planner: 'planner',
		goals: 'goals',
		diary: 'diary',
		ideas: 'ideas',
		health: 'health',
		finance: 'wallet',
		inventory: 'shopping',
		media: 'image'
	};

	/**
	 * The glyph behind the page, where the section is not specific enough.
	 *
	 * People and Notebooks both belong to the Diary section, so keying the
	 * background off the section alone drew a journal behind all three — and the
	 * whole point of the wash is that a room looks like itself. Longest prefix
	 * wins, so `/notebooks` beats `/diary`.
	 */
	const ROUTE_GLYPH: [string, IconName][] = [
		['/notebooks', 'notebook'],
		['/notebooks/people', 'user'],
		['/health/recipes', 'utensils'],
		// Settings belongs to no room, so it fell through to home — and the
		// account page was tiled with houses.
		['/settings', 'user'],
		['/settings/instance', 'settings'],
		['/admin', 'shield']
	];

	const pageGlyph = $derived(
		ROUTE_GLYPH.filter(([prefix]) => page.url.pathname.startsWith(prefix)).sort(
			(a, b) => b[0].length - a[0].length
		)[0]?.[1] ?? SECTION_GLYPH[sectionKey]
	);

	function isNavActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		// People sits beside the writing in the bar, not under it, so the
		// Notebooks entry means the notebooks and the diary and nothing else.
		if (href === '/notebooks')
			return (
				page.url.pathname === '/notebooks' ||
				(page.url.pathname.startsWith('/notebooks/') &&
					!page.url.pathname.startsWith('/notebooks/people'))
			);
		if (href === '/tasks/plan') return page.url.pathname.startsWith('/tasks');
		if (href === '/goals') return page.url.pathname.startsWith('/goals');
		if (href === '/health/habits') return page.url.pathname.startsWith('/health');
		return page.url.pathname === href;
	}

	import { GLOBAL_SHORTCUTS } from '$lib/shortcuts';
	import Icon from '$lib/components/Icon.svelte';
	import { dev } from '$app/environment';
	import { commandKey } from '$lib/platform';
	function handleGlobalKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const action = GLOBAL_SHORTCUTS.find((s) => s.key === e.key)?.action;

		switch (action) {
			case 'global-next-page':
			case 'global-prev-page': {
				e.preventDefault();
				let currentIdx = nav.findIndex((item) => isNavActive(item.href));
				const idx = currentIdx === -1 ? 0 : currentIdx;
				const next =
					action === 'global-next-page'
						? (idx + 1) % nav.length
						: (idx - 1 + nav.length) % nav.length;
				// `href` is typed as a real route of this app, so there is nothing
				// left to resolve. The rule only recognises a literal resolve()
				// call sitting in the argument, which this cannot be.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				goto(nav[next].href);
				break;
			}
		}
	}

	/**
	 * The scrolling element, on a phone.
	 *
	 * With the window frozen, SvelteKit's scroll handling has nothing to move —
	 * so a new page would otherwise open halfway down where the last one was
	 * left.
	 */
	let scroller: HTMLElement | undefined = $state();

	/*
	 * The surface a swipe is listened for on.
	 *
	 * Offered rather than used here: the shell has no idea what a swipe means
	 * on any given screen. `TabbedRoom` does, and it listens on this — which is
	 * how a swipe works over the empty half of a short page as well as over its
	 * content.
	 */
	provideSwipeSurface(() => scroller);

	/**
	 * The other top-level screens, in the order the bottom bar has them.
	 *
	 * The rooms are the wheel; these are the places either side of it. Home is
	 * the hub, so it comes before every room, and the rest follow — which is
	 * what makes tapping between Home, Search and Account move at all. They all
	 * counted as "not a room" before, and a hop with the same non-answer at both
	 * ends is a hop that was thrown away.
	 */
	const BESIDE_THE_WHEEL = ['/search', '/settings', '/instance', '/account'];

	/**
	 * Where a path sits in the row of screens.
	 *
	 * The rooms in this account's own menu order, the dashboard before them as
	 * the hub the wheel turns around, and the rest after. Moving along the row
	 * should look like moving along it, and which way depends on where you were
	 * and where you went.
	 *
	 * Anywhere deeper than a top-level screen answers with the screen it is
	 * inside, so opening a notebook or changing tab is not a move along this row
	 * — those are the room's own business.
	 */
	function placeAt(pathname: string): number {
		const room = allNav.findIndex((place) => {
			const root = place.href.split('/')[1];
			return root ? pathname === `/${root}` || pathname.startsWith(`/${root}/`) : false;
		});
		if (room >= 0) return room;
		if (pathname === '/') return -1;

		const beside = BESIDE_THE_WHEEL.findIndex(
			(href) => pathname === href || pathname.startsWith(`${href}/`)
		);
		return allNav.length + (beside >= 0 ? beside : BESIDE_THE_WHEEL.length);
	}

	/** The panel that moves. Its content is `pageBody`, which is what is replaced. */
	let page$ = $state<HTMLElement>();
	let pageBody = $state<HTMLElement>();
	/** Kept as tall as what left, so nothing below walks up the page. */
	let roomFrame = $state<HTMLElement>();
	/** Where the copy of the outgoing room is put. Svelte never fills it. */
	let roomStage = $state<HTMLElement>();
	let changedRoom = 0;
	/** The empty panel's arrival, so landing can ask whether it is still going. */
	let roomArriving: Animation | null = null;

	/*
	 * `beforeNavigate`, and it has to be: `onNavigate` runs *after* the load.
	 * SvelteKit's `navigate()` awaits `load_route(intent)` and only then calls
	 * the `onNavigate` callbacks, so a movement started there begins once the
	 * data has already arrived. See the same note in `TabbedRoom.svelte`.
	 */
	beforeNavigate((navigation) => {
		const from = placeAt(navigation.from?.url.pathname ?? '');
		const to = placeAt(navigation.to?.url.pathname ?? '');
		/*
		 * Nothing when both ends are the same place: a change of tab, or opening
		 * something inside a room, is the room's own business, and sliding both
		 * would be two movements over one navigation.
		 *
		 * Negated, deliberately. Going *down* the menu brings the new room in
		 * from the left, which is the opposite of what a tab does — and it is
		 * what was asked for. A tab change has a finger behind it and the screen
		 * follows the finger; picking a room off the menu has none.
		 */
		/*
		 * And the screens either side of the wheel turn the other way again.
		 *
		 * Home and the account screen are not on the wheel — they are what it
		 * turns around — so borrowing the rooms' handedness made going out to
		 * one look like going backwards along the row. Either end off the wheel
		 * flips it.
		 */
		const offTheWheel = from < 0 || to < 0 || from >= allNav.length || to >= allNav.length;
		changedRoom = from === to ? 0 : (offTheWheel ? 1 : -1) * Math.sign(to - from);
		// A navigation that leaves the app takes the page away itself; hiding
		// the room for it only means staring at nothing while it goes.
		if (!navigation.to || navigation.willUnload) changedRoom = 0;
		// Zeroed when the movement is skipped, or the landing in afterNavigate
		// would play an arrival on a screen that never slid — which is how the
		// desktop briefly caught a transition it was never meant to have.
		const slides = Boolean(changedRoom && page$ && pageBody && roomStage && slidesHere());
		if (!slides) changedRoom = 0;

		/*
		 * The mark answers the press, on every navigation and not only the slow
		 * ones.
		 *
		 * This used to hang off `navigating`, which is a store that is set and
		 * cleared again — so a navigation quick enough to be over inside one
		 * flush was never observed as a wait at all, and the mark did not move.
		 * On a desktop that is most of them: the thing that tells you the app
		 * heard you was missing exactly when the app was quickest. Here it is a
		 * press rather than a wait, and `stopMarkSpin` in `afterNavigate`
		 * carries it round to the next upright however early it is asked —
		 * which from a standing start is one whole turn.
		 *
		 * `-changedRoom`, so the medallion turns the way the rooms are sweeping;
		 * zero where nothing slid, which spins it the one way it always did.
		 */
		if (navigation.to && !navigation.willUnload)
			startMarkSpin([deskMark, barMark, barMarkGround], -changedRoom);

		// Named again rather than left to `slides`: the same test, in the shape
		// that tells the compiler these three are really here.
		if (!changedRoom || !page$ || !pageBody || !roomStage) return;

		/*
		 * Both halves at the press, rather than one at the press and one when
		 * the data lands.
		 *
		 * The movement used to be: take the old room off, wait for the next one
		 * to load, bring it on — so the arrival *was* the load, and on a slow
		 * one the screen left and nothing happened until it finished. It is the
		 * other way round now: the room leaves, the empty panel arrives behind
		 * it, and if the data has not come by the time it settles the mark turns
		 * in the middle of a panel that has already stopped moving.
		 *
		 * `arc`: a room change is a turn of the menu, so it travels round the
		 * wheel rather than straight across. See `$lib/slide`.
		 */
		holdHeight(roomFrame, pageBody);
		slideAway(roomStage, pageBody, changedRoom, true);
		roomArriving = slideOn(page$, changedRoom, true);
	});

	afterNavigate(() => {
		// Asked to stop as soon as the room is here; it finishes its turn on the
		// way, so the quickest navigation still leaves a mark that went round.
		stopMarkSpin();
		// Joining the panel mid-flight when the load was quick, or arriving
		// again — with the room finally in it — when the load outlived the
		// slide. Never appearing in place: see `landOn`.
		landOn(page$, pageBody, roomArriving, changedRoom, true);
		releaseHeight(roomFrame);
		changedRoom = 0;
		roomArriving = null;
	});

	/*
	 * Nothing may leave the screen hidden.
	 *
	 * A screen goes out of sight while its copy travels, and it is `slideOn`
	 * that brings it back — which never runs for a navigation that is abandoned
	 * or superseded. So the moment nothing is navigating, whatever is here is
	 * on view, whether a movement finished or not.
	 */
	$effect(() => {
		if (!navigating.to) {
			stopHiding(pageBody);
			releaseHeight(roomFrame);
		}
	});

	/**
	 * Arriving somewhere puts you at the top of it. Staying does not.
	 *
	 * `noScroll` is SvelteKit's way of saying "the address changed and nothing
	 * else did", and it governs the window — but on a phone the box that
	 * scrolls is this `main`, and scrolling it to the top regardless undid
	 * exactly what that flag was asking for. Reminders is where it showed:
	 * pressing "30" to look a month ahead threw you back to the top, away from
	 * the control under your thumb.
	 *
	 * The rule is the honest one rather than a flag passed down: a navigation
	 * that ends on the same screen it started on is not an arrival.
	 */
	afterNavigate(({ from, to }) => {
		if (from?.url && to?.url && from.url.pathname === to.url.pathname) return;
		scroller?.scrollTo({ top: 0 });
	});

	/**
	 * A write refused before it reached its action, said once, anywhere.
	 *
	 * `hooks.server.ts` refuses some writes outright — the demo cannot change
	 * the administration pages, and cannot delete its own account. That refusal
	 * cannot come back as a `fail()` from an action that never ran, so it comes
	 * back marked `refused`, and it is said here rather than by each of the
	 * thirty forms that might receive one. A form that shows `form.message`
	 * still shows it too; this is what covers the ones that do not.
	 */
	let refusalSaid: string | null = null;
	$effect(() => {
		const form = page.form as { refused?: boolean; message?: string } | null;
		if (!form?.refused || typeof form.message !== 'string') return;
		if (form.message === refusalSaid) return;
		refusalSaid = form.message;
		notify.error(form.message);
	});

	function handleClickOutside(e: MouseEvent) {
		if (menuOpen) {
			const target = e.target as HTMLElement;
			if (!target.closest('.menu-container')) {
				menuOpen = false;
			}
		}
	}

	/**
	 * Register the service worker — which nothing was doing.
	 *
	 * `svelte.config.js` sets `serviceWorker.register: false`, for a real reason
	 * about Vite's module URLs in development. But that flag is not conditional:
	 * it turns SvelteKit's registration off in the production build too, and
	 * nothing else here ever called `register()`. So the worker was built and
	 * shipped on every deploy and never ran anywhere — the offline page, the
	 * shopping list in a basement, and every push notification with it.
	 *
	 * Found while giving reminders a way to reach a phone: the browser had no
	 * worker to wake. So the registration lives here, where it can be conditional
	 * — production only, which is exactly what the config comment describes.
	 */
	$effect(() => {
		if (dev || typeof navigator === 'undefined' || !navigator.serviceWorker) return;

		// Classic, not a module: that is how SvelteKit bundles it for a build.
		//
		// A browser that refuses one still has an app, so this is not fatal — but
		// it is not silent either. Swallowing the error entirely is how the worker
		// came to be shipped on every deploy and never run anywhere, and a script
		// that throws while the browser evaluates it fails in exactly the same
		// invisible way. One line is the difference between a mystery and a
		// message.
		void navigator.serviceWorker.register('/service-worker.js').catch((e) => {
			console.error('[sw] registration refused:', e);
		});
	});

	/**
	 * Get rid of a service worker left over from before it was turned off in dev.
	 *
	 * Vite's module URLs carry a version that changes when the dev server
	 * restarts. A worker that had cached a page kept serving HTML pointing at
	 * modules that no longer existed: every import failed, nothing hydrated, the
	 * offline fallback appeared and the page reloaded into the same state
	 * forever — with nothing in the server log, because none of it reached the
	 * server. Registration is off in dev now, but a browser that already has one
	 * keeps it until somebody says otherwise.
	 */
	$effect(() => {
		if (!dev || typeof navigator === 'undefined' || !navigator.serviceWorker) return;

		void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
			if (registrations.length === 0) return;

			await Promise.all(registrations.map((r) => r.unregister()));
			if (typeof caches !== 'undefined')
				await caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));

			location.reload();
		});
	});

	/*
	 * The loading bar gives up eventually.
	 *
	 * `navigating` is SvelteKit's and it should clear itself; a navigation that
	 * is superseded or abandoned can leave it set, and then the indicator says
	 * "still working" for the rest of the session. Twenty seconds is far past
	 * any real page here, so past it the honest thing is silence: the page under
	 * it is the real page, and it is already on screen.
	 */
	let givenUp = $state(false);
	/*
	 * While the navigation is on, the menu itself turns.
	 *
	 * There used to be a mark spawned behind the departing screen for this;
	 * spinning a thing that appeared for the occasion. The mark that opens the
	 * rooms is already on every screen — the corner of the header, the raised
	 * button in the phone bar — so that is the one that turns.
	 *
	 * Started and stopped by `beforeNavigate` and `afterNavigate` above rather
	 * than by watching `navigating`: that store is set and cleared again, and a
	 * navigation quick enough to be over inside one flush was never seen as a
	 * wait — which on a desktop is most of them.
	 */
	/* The two marks the spin turns: the header's and the phone bar's. */
	let deskMark = $state<HTMLElement>();
	let barMark = $state<HTMLElement>();
	/** The octagon behind it, which turns with it. See the note by the markup. */
	let barMarkGround = $state<HTMLElement>();
	/*
	 * The turn is started and stopped by the navigation itself — see
	 * `beforeNavigate` and `afterNavigate` above. This is only the giving up:
	 * a navigation that never arrives would otherwise turn the mark for the
	 * rest of the session, and past twenty seconds the honest thing is to stop
	 * saying "working".
	 */
	$effect(() => {
		if (givenUp) stopMarkSpin();
	});
	$effect(() => {
		if (!navigating.to) {
			givenUp = false;
			return;
		}
		const timer = setTimeout(() => (givenUp = true), 20_000);
		return () => clearTimeout(timer);
	});

	// Reads the keyboard on hydration; `Ctrl` until then, which is the
	// commoner answer.
	let key = $state('Ctrl');
	$effect(() => {
		key = commandKey();
	});

	// How long a delete waits before it happens, from the instance's config.
	$effect(() => {
		undo.seconds = data.undoSeconds;
	});

	/*
	 * "The app is running", said once, where a test can see it.
	 *
	 * An effect only ever runs in the browser and only after hydration, so this
	 * attribute appearing is the exact moment the page starts answering
	 * keystrokes. The suite used to wait for an idle network to mean the same
	 * thing, which was always a guess and stopped being true at all the day this
	 * app started holding a stream open.
	 */
	$effect(() => {
		document.documentElement.dataset.ready = 'true';
	});

	/*
	 * The page keeps itself current while something else is writing.
	 *
	 * The browser is no longer the only thing that changes this account — an
	 * assistant with a token writes to it too, and until this existed the tab
	 * went on showing the week as it was before you asked. One stream for the
	 * whole app rather than one per page: every screen is drawn by loaders, so
	 * re-running them is all any of them needs.
	 *
	 * Only for somebody signed in, and torn down with the layout. `$effect`
	 * returns its own cleanup, which is what closes the stream when the tab goes.
	 */
	$effect(() => {
		if (!data.user) return;
		return live();
	});

	/* ------------------------------------------------------------- the tour */

	let tour = $state<Tutorial | undefined>();

	/**
	 * Shown around once, on the way in.
	 *
	 * On the dashboard and nowhere else: it is the screen first run lets go of
	 * somebody on, and it is the only tour that explains the parts of the app
	 * that are on every screen. Somebody who deep-links into a room instead gets
	 * the button in the corner, which is the same tour on demand.
	 *
	 * A short wait first — the page under it has to have drawn the things the
	 * tour points at before the light can find them.
	 */
	let tourOffered = false;
	const DEMO_TOUR_KEY = 'ontoplano.tourSeen';

	$effect(() => {
		if (!data.tutorialPending || tourOffered) return;
		if (page.url.pathname !== '/') return;
		// The demo's account is shared with nobody and thrown away, so its
		// dismissal is remembered by the tab rather than by the database.
		if (data.demo && sessionStorage.getItem(DEMO_TOUR_KEY)) return;

		tourOffered = true;
		const timer = setTimeout(() => tour?.start(), 500);
		return () => clearTimeout(timer);
	});

	function tourDismissed() {
		tourOffered = true;
		if (data.demo) {
			try {
				sessionStorage.setItem(DEMO_TOUR_KEY, '1');
			} catch {
				// A browser that refuses storage gets the tour again next page. That
				// is a nuisance and not a reason to break anything.
			}
			return;
		}

		void fetch('/api/tutorial', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ seen: true })
			// Remembering that somebody has seen the tour is not worth an error
			// message if it fails; they see it once more.
		}).catch(() => {});
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} onclick={handleClickOutside} />

{#if data.user && !bareScreen}
	<!--
		On a phone this is an app shell: the window itself never scrolls, only the
		main area does, and the bottom bar is the last row of a full-height column.
		A `position: fixed` bar is anchored to the layout viewport, so when the
		browser's address bar slides back in on an upward scroll the bar goes with
		it — off the bottom of the screen. This keeps it on screen because it is
		part of the screen. Above `md` the page scrolls normally again.
	-->
	<div
		class="page-surface relative flex h-[100dvh] flex-col overflow-hidden bg-gray-100 lg:h-auto lg:min-h-screen lg:overflow-visible"
		style="{categoryStyle()};--section-accent:{section.accent}"
	>
		{#if data.demo}
			<!--
				The demo says so at the very top: this page is not what it
				looks like. Above `lg` only; the phone gets
				the strip above the bottom bar instead, because a band at the
				top of a phone pushes the whole app down for a sentence.
			-->
			<div
				class="relative z-50 hidden flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 lg:flex"
			>
				<!--
					The warning is the point, so it is the part that is loud.
					"Everything here is yours alone" read as reassurance and invited
					exactly the thing this band exists to prevent: somebody typing
					their real week into an account that is deleted this afternoon.
					Red on the amber band, and it says wiped rather than disappears.
				-->
				<span>
					<strong>{t('home.thisIsADemoVersion')}</strong>
					<strong class="text-red-900">
						{t('home.doNotPutYourReal')}
					</strong>
				</span>
				{#if data.demoHost}
					<span class="font-normal">{t('home.openOnYourPhoneTo', { demoHost: data.demoHost })}</span
					>
				{/if}
			</div>
		{/if}

		{#if data.staging}
			<!--
				Staging says so on every page, in the same place and the same shape
				as the demo's band — they are the same statement: this is not the
				instance you think it is.

				It said it on the sign-in form and nowhere else, so a signed-in
				staging session was pixel-identical to the real one. That is the
				state in which somebody types a real week into a copy.
			-->
			<!--
				On a wide screen it sits at the top of the page, where a banner
				goes and where there is room for the sentence.
			-->
			<div
				class="relative z-50 hidden flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 lg:flex"
			>
				<span>
					<strong>{t('home.staging')}</strong>
					{t('home.aCopyOfOntoplanoFor')}
					<strong class="text-red-900">{t('home.nothingHereIsPromisedTo')}</strong>
				</span>
			</div>

			<!--
				On a phone it sits above the bottom bar, exactly where the demo's
				band does — and for the reason that one is there rather than at the
				top: the top of a phone screen belongs to the status bar, and a
				band put there is drawn underneath the clock and the battery. It
				was, and the first two words of it were unreadable.

				Two halves, split around the mark that rises out of the middle of
				the bar, the same way the demo's band is split.
			-->
			<div
				class="fixed inset-x-0 z-30 flex items-center justify-between bg-amber-500 px-3 text-[11px] leading-none font-medium text-amber-950 lg:hidden"
				style="bottom: calc(var(--mobile-nav-height) + var(--safe-bottom)); height: 1.95rem"
			>
				<span><strong>{t('home.staging2')}</strong></span>
				<!-- Clear of the help dock, which floats over this corner. -->
				<span class="pe-10">{t('home.nothingSurvives')}</span>
			</div>
		{/if}

		{#if data.familyOffer}
			<!--
				Somebody has offered to pay for this account, and nothing has
				happened to it yet. The band asks; the two buttons answer.

				Blue rather than amber: this is not a warning, it is an offer —
				and the sentence about a subscription of one's own only appears
				for the account that has one, because for everybody else it is a
				complication that does not apply to them.
			-->
			<div
				class="relative z-50 flex flex-wrap items-center justify-between gap-2 bg-blue-600 px-4 py-2 text-sm font-medium text-white"
			>
				<span>
					<strong>{data.familyOffer.ownerName}</strong>
					{t('home.offersToPayForYour')}
					{#if data.familyOffer.ownPlanEnds}
						{t('home.youPayForItYourself')}
					{:else}
						{t('home.yourNotesAndYourWeek')}
					{/if}
				</span>
				<span class="flex shrink-0 items-center gap-1">
					<form method="post" action="/settings/billing?/declineFamilyOffer" use:enhance>
						<button
							class="border border-blue-200 px-2 py-1 text-xs font-semibold hover:bg-blue-500"
						>
							{t('home.noThanks')}
						</button>
					</form>
					{#if !data.familyOffer.ownPlanEnds}
						<form method="post" action="/settings/billing?/acceptFamilyOffer" use:enhance>
							<button
								class="border border-white bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
							>
								{t('home.accept')}
							</button>
						</form>
					{/if}
				</span>
			</div>
		{/if}

		{#if data.appUpdate && !updateHushed}
			<!--
				The installed app is a minor behind the instance drawing these
				pages, which is the state where a page can ask the shell for
				something it does not have. Said before it errors rather than
				after, with both numbers on it, and dismissible — the person may
				well not be able to update right now, and the app still mostly
				works. Amber like staging: a warning, not a wall.

				Only the native app ever sees this (the answer rides on the
				launch cookie), so the top inset is real: without it the words
				sit under the phone's clock.
			-->
			<div
				class="relative z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950"
				style="padding-top: calc(var(--safe-top, 0px) + 0.5rem)"
			>
				<span>
					<strong>{t('home.updateTheApp')}</strong>{t('home.itIsAndThisInstance', {
						app: data.appUpdate.app,
						instance: data.appUpdate.instance
					})}</span
				>
				<button
					class="shrink-0 border border-amber-700 px-2 py-1 text-xs font-semibold hover:bg-amber-400"
					onclick={hushUpdate}
				>
					{t('home.notNow')}
				</button>
			</div>
		{/if}

		<SectionPattern icon={pageGlyph} />
		<!--
			No top bar on a phone.
			
			Everything in it above `lg` — the section tabs, search, the pies, the
			account menu — already lives in the bottom bar down there, so all the
			header did on a phone was spend a strip of a small screen on the word
			"ontoplano". An app does not put its own name above every screen.
		-->
		<header
			class="relative z-40 hidden bg-chrome shadow-raised lg:block"
			style="padding-top: var(--safe-top)"
		>
			<div class="mx-auto flex w-full max-w-page items-stretch justify-between px-4 sm:px-6">
				<div class="flex min-w-0 items-stretch gap-4 min-[1460px]:gap-6">
					<!--
						The mark and the name, together, at the corner every app puts them
						in. The mark was over on the right among the tools, which made it
						read as a fourth button rather than as the thing the app is called
						— and left the name beside it looking like a word somebody forgot
						to give a logo.

						It is still the way into the rooms. The rooms, as a pie: the bar
						beside it tells you where you are and ⌘K is faster once you know
						it exists; this is the one for a hand on the mouse.
					-->
					<div class="flex shrink-0 items-center gap-2">
						<!-- No box around it: the octagon is its own outline, so a
						     bordered square behind it reads as two shapes where there is
						     one — the same reason the phone bar's button is clipped to
						     the mark rather than drawn as a circle holding it. -->
						<button
							bind:this={deskMark}
							data-mark
							onpointerdown={(e) => rooms?.summon(e)}
							class="pie-handle flex h-8 w-8 items-center justify-center transition hover:brightness-125 {roomsOpen
								? 'pie-handle-held'
								: ''}"
							aria-label={t('home.jumpToASection')}
							title={t('home.jumpToASection')}
							data-tour="rooms"
						>
							<Logo size={32} />
						</button>
						<!-- Lit the same way the mark beside it is: the two are one
						     control to look at, and only half of it answering the mouse
						     reads as the other half being decoration. -->
						<a
							href={resolve('/')}
							class="wordmark text-lg whitespace-nowrap text-chrome-ink transition hover:brightness-125"
							>Ontoplano</a
						>
					</div>
					<!--
						Ten sections of words need about a thousand pixels; below `lg` the
						bottom bar takes over, which also covers a tablet.

						`nowrap` and a scroll of its own because the bar is at the width
						where the next feature has nowhere to go: without them the links
						wrapped into two lines the moment the header grew a button, and a
						navigation that reflows as you add to it is a navigation that will
						break again.
					-->
					<nav class="hidden min-w-0 overflow-x-auto lg:flex" data-tour="nav">
						<!--
							The hrefs are typed as real routes of this app. The rule reads
							the href expression and cannot see through the array, so it is
							off for the loop rather than for the file.
						-->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						{#each nav as item (item.href)}
							{@const active = isNavActive(item.href)}
							<!-- Active tab is a solid block of its section colour; the rest stay
							     neutral so the fill is the thing that reads. -->
							<a
								href={item.href}
								title={t(item.name)}
								class="tab-link flex shrink-0 items-center gap-1 border-b-2 px-3 py-4 text-sm whitespace-nowrap transition-colors min-[1460px]:gap-1.5 min-[1460px]:px-3 xl:px-1.5 [&>svg]:h-5 [&>svg]:w-5 xl:[&>svg]:h-4 xl:[&>svg]:w-4 {active
									? 'font-semibold text-chrome-ink'
									: 'border-transparent font-medium text-chrome-muted hover:border-chrome-line hover:text-chrome-ink'}"
								style={active ? `border-color: ${item.accent}` : ''}
							>
								<!-- The icon set, rather than a path copied into this file: the
								     bar and the pie draw the same place with the same glyph. -->
								<Icon name={item.icon} size={16} />
								<!--
									Ten first-class sections, squeezed rather than grouped. Every
									one of these is somewhere you go, and burying four of them
									behind a "Write" menu to save a hundred pixels makes them
									harder to find rather than easier. Words from 1280px up; below
									that the glyphs carry it, with `title` saying the word.

									And when the glyph IS the target, it gets the room the words
									were using: bigger, with real padding either side. A row of
									16px icons at 1.5 units of padding is a row of things that
									are hard to hit and hard to tell apart.
								-->
								<span class="hidden xl:inline">{t(item.name)}</span>
							</a>
						{/each}
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</nav>
				</div>
				<div
					class="menu-container relative hidden shrink-0 items-center gap-2 min-[1460px]:gap-3 lg:flex"
				>
					<!-- A keyboard-only feature is an invisible one. The box says the app
					     can be searched; the shortcut is for after you know that.
					     As wide as the space allows: a search box the size of its own
					     word reads as an afterthought on a 2000px header. -->
					<button
						onclick={() => (palette.open = true)}
						class="flex w-40 items-center gap-2 border border-chrome-line bg-chrome-raised px-3 py-1.5 text-sm text-chrome-muted transition hover:text-chrome-ink hover:brightness-125 min-[1460px]:w-72"
						data-tour="search"
					>
						<Icon name="search" size={14} />
						{t('ui.search')}
						<kbd
							class="kbd-hint ml-auto hidden border border-chrome-line px-1 text-xs min-[1460px]:inline-block"
							>{key} K</kbd
						>
					</button>
					<!-- Capture, beside search: the two things you reach for without
					     having decided where you are going. -->
					<button
						onpointerdown={(e) => pie?.summon(e)}
						class="pie-handle flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125 {pieOpen
							? 'pie-handle-held'
							: ''}"
						aria-label={t('home.writeSomethingDown')}
						title={t('home.writeSomethingDown')}
						data-tour="capture"
					>
						<Icon name="plus" size={16} />
					</button>
					<!-- To the right of the plus and left of the name: it belongs with
					     the things the bar does rather than with who you are. -->
					<NotificationBell
						held={data.notifications ?? []}
						unread={data.unreadNotifications ?? 0}
					/>
					<span class="text-sm text-chrome-muted">{data.user.name}</span>
					<button
						onclick={() => (menuOpen = !menuOpen)}
						class="flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125"
						aria-label={t('home.menu')}
						data-tour="menu"
					>
						<!-- A fifth larger than the icons beside it: it is the way into
						     everything the bar does not show, and it was reading as the
						     smallest thing up here. -->
						<svg class="size-[1.2rem]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="square"
								stroke-linejoin="miter"
								stroke-width="2"
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
					</button>
					{#if menuOpen}
						<div
							class="rise absolute top-full right-0 z-50 mt-1 w-44 border border-gray-200 bg-white shadow-overlay"
						>
							<div class="border-b border-gray-200 px-4 py-2">
								<span class="eyebrow text-gray-600">{t('home.theme')}</span>
								<form
									method="post"
									action="/settings/preferences?/setTheme"
									use:enhance={({ formData }) => {
										// <html> lives outside the component tree, so `update()` will
										// not touch it — set it here and let the reload agree later.
										const chosen = formData.get('theme')?.toString();
										if (chosen) document.documentElement.dataset.theme = chosen;
										return async ({ update }) => {
											await update({ reset: false });
											menuOpen = false;
										};
									}}
									class="mt-2 flex"
								>
									{#each THEMES as option (option)}
										<button
											type="submit"
											name="theme"
											value={option}
											class="flex-1 border px-2 py-1 text-xs capitalize {data.theme === option
												? 'border-gray-900 bg-gray-900 font-semibold text-white'
												: 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'}"
										>
											{option}
										</button>
									{/each}
								</form>
							</div>
							<!-- No account on a device that is its own instance, so no
							     entry for one: the page behind it refuses. -->
							{#if !onDevice}
								<a
									href={resolve('/settings/account')}
									onclick={() => (menuOpen = false)}
									class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
								>
									{t('home.account')}
								</a>
							{/if}
							<a
								href={resolve('/settings/preferences')}
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								{t('home.preferences')}
							</a>
							<a
								href={resolve('/settings/integrations')}
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								{t('home.aiAmpIntegrations')}
							</a>
							<!--
								Not on the demo. The account was handed over by a cookie and
								has no password anybody knows, so signing out of it is leaving
								for good — the visit ends and the door does not reopen. The
								endpoint refuses too; this is so nobody is offered the button
								in the first place.
							-->
							{#if onDevice}
								<!--
									There is no session here to end — what leaving means on a
									device is pointing the app at another ontoplano. It stands
									where Sign out does everywhere else, because that is where
									somebody looks for the way out.
								-->
								<a
									href={resolve('/instance')}
									onclick={() => (menuOpen = false)}
									class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
								>
									{t('home.whereThisLives')}
								</a>
							{:else if data.demo}
								<!--
									Where Sign out would be, on a demo that has no way back in.
									Somebody who has made a mess of the fixtures wants a clean
									copy, not the door — and this is where they will look for it.
								-->
								<!--
									The menu closes on the press, and the answer arrives as a
									notice. It used to leave the menu hanging open over a page
									that had silently been rebuilt underneath it, so the only way
									to tell it had worked was to close the menu and look.
								-->
								<form
									method="post"
									action="/login?/resetDemo"
									use:enhance={() => {
										menuOpen = false;
										return async ({ result, update }) => {
											await update();
											if (result.type === 'success' || result.type === 'redirect') {
												notify.success(t('home.freshDemoAccountEverything'));
											} else {
												notify.error(t('home.thatDidNotWorkReload'));
											}
										};
									}}
								>
									<button
										type="submit"
										class="w-full px-4 py-2 text-left text-sm {NAV_DROPDOWN_ITEM} transition"
									>
										{t('home.resetDemoAccount')}
									</button>
								</form>
							{:else}
								<form method="post" action="/login?/signOut" use:enhance>
									<button
										type="submit"
										class="w-full px-4 py-2 text-left text-sm {NAV_DROPDOWN_ITEM} transition"
									>
										{t('home.signOut')}
									</button>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</header>
		<!--
			That something is happening, when it takes long enough to wonder.
			
			A tap that loads a page from the server has no answer for a moment,
			and a moment with no answer reads as a tap that missed. This is the
			answer: a bar across the top while a navigation is in flight.
			
			After a beat, not immediately — most navigations here are faster than
			the eye, and a bar that flashes on every one of them is worse than
			none. `navigating` is SvelteKit's own, so it covers a link, a
			redirect and a form action alike — and it stops after twenty seconds
			whatever `navigating` still says, because a loading indicator that
			never ends is not information. The skeleton that used to stand here
			was removed for exactly that: it got stuck on a navigation that never
			finished, and a screen of grey blocks reads as a broken app rather
			than a slow one.
		-->
		{#if navigating.to && !givenUp}
			<div class="nav-progress" role="status" aria-label={t('home.loading')}></div>
		{/if}

		<main
			bind:this={scroller}
			class="page-gutter relative z-10 mx-auto w-full max-w-page flex-1 overflow-y-auto overscroll-y-contain pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--mobile-nav-height)+var(--safe-bottom)+var(--help-dock-height)+var(--bar-mark-rise)+0.75rem)] lg:overflow-visible lg:pt-6 lg:pb-[calc(var(--help-dock-height)+1.5rem)]"
		>
			<!-- `.slide-frame` clips the movement between rooms, and gives the page
			     gutter back first so a card that bleeds to the screen edge still
			     reaches it. -->
			<div bind:this={roomFrame} class="slide-frame">
				<div bind:this={page$}>
					<div bind:this={pageBody}>{@render children()}</div>
				</div>
				<div bind:this={roomStage} class="slide-stage" aria-hidden="true"></div>
			</div>
		</main>

		<!--
			Four icons, and no words.

			Settings and search used to hang off the pie itself, where they could not
			be dragged to and — after a mouse tap left the swallow flag set — could
			not be clicked either. They are not wedges; they are destinations, and
			they belong in the bar with the two pies. Icons alone, because four
			labels at 390px is four truncations.
		-->
		<!--
			Fixed to the viewport, on purpose. It used to be the last row of the
			full-height column, which meant anything that made the column taller
			than the screen — a root scroll the browser sneaks in to reveal a
			focused input, a viewport-height misreading in the webview — pushed
			it off the bottom or clipped it away entirely. A fixed element cannot
			be pushed by any of that; the main area pads its bottom to match.
		-->
		<!--
			The bar wears the mark's own field — the dark ground between the
			medallion and the ring, measured off the artwork — so the mark's
			inside flows into the bar instead of ending at an edge. No hairline
			on top: the edge IS the change of colour.

			On the device it wears the lifted one, because the mark above it is
			the lifted mark: the two are a single surface, and one of them
			changing colour without the other would draw exactly the disc the
			flowing-in is there to avoid.
		-->
		<nav
			class="fixed inset-x-0 bottom-0 z-40 lg:hidden"
			style="padding-bottom: var(--safe-bottom); background: {barField}"
			aria-label={t('home.primary')}
			data-tour="mobile-bar"
		>
			<div class="flex" style="height: var(--mobile-nav-height)">
				<!--
					The account, so it wears a person. It used to wear the settings
					glyph, which was a sun with rays: on a phone bar, next to search
					and a plus, that reads as a brightness control and nothing else.
				-->
				<!--
					Home, search, the pies, the plus, the account — in that order.
					
					It read account, search, home, plus: the one destination nobody
					visits twice a day sat under the first thumb position, and home was
					fourth. The two raised pies keep the middle, which is the reach a
					thumb actually has.
				-->
				<!-- Home by name, since the pie no longer offers it. -->
				<a
					href={resolve('/')}
					class="tap flex flex-1 items-center justify-center {page.url.pathname === '/'
						? 'text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label={t('home.home')}
					title={t('home.home')}
				>
					<Icon name="home" size={22} />
				</a>

				<button
					type="button"
					onclick={() => (palette.open = true)}
					class="tap flex flex-1 items-center justify-center text-chrome-muted"
					aria-label={t('ui.search')}
					title={t('ui.search')}
					data-tour="search"
				>
					<Icon name="search" size={22} />
				</button>

				<!--
					The rooms, raised out of the middle of the bar the way a docked
					action button is: the one control here that opens a gesture rather
					than a page earns the bump that says "this one is different".
				-->
				<div class="relative flex-1">
					<!--
						The button IS the mark.

						It used to be a circle with the mark inside it, which is two
						shapes where there is one — an octagon in a ring, neither of them
						quite the thing. The button is clipped to the mark's own outline
						now and the mark fills it edge to edge, so the raised control on
						the bar is the logo and nothing else.

						The outline is measured from `mark.png` by `yarn icons` into
						`mark-shape.ts`, so replacing the logo reshapes this button too.
						No border and no ground: a clipped edge cannot carry a border,
						and the mark's own bright rim is the edge.
					-->
					<!--
						A ground the shape sits on.

						The button is clipped to the mark's outline, and a clipped edge
						carries no border — so the bar's own top line ran straight
						through the shape and the page showed through the notches of
						its rim. This is the bar's colour in the same outline, a hair
						larger, which gives the mark an edge to end at.
					-->
					<!--
						It turns with the mark, and that is the whole reason it is marked.

						Both shapes are the same octagon, and the ring between them is
						the difference between the outer one's flats and the inner one's
						corners. Turn only the inner one and that difference breathes
						eight times a turn — 3.2px of rim where the corners agree, 0.2px
						a moment later where a corner points at a flat. Nothing moves off
						centre; the rim around it thins and thickens, and the eye reads
						that as a wobble.

						Spinning the ground with it holds the two in step, so the rim is
						the same width at every angle. It is a flat colour, so turning it
						is invisible except for the thing it fixes.
					-->
					<span
						bind:this={barMarkGround}
						data-mark
						aria-hidden="true"
						style="clip-path: {MARK_CLIP_PATH}; top: calc(-1 * var(--bar-mark-ground-rise)); height: var(--bar-mark-ground); width: var(--bar-mark-ground); background: {markField}"
						class="pointer-events-none absolute left-1/2 -translate-x-1/2"
					></span>
					<!-- `data-mark` names it for code that runs before this component
					     exists: a turn started on the screen you came from is picked up
					     here, off the server-rendered mark, before anything hydrates.
					     See `hooks.client.ts`. -->
					<button
						bind:this={barMark}
						data-mark
						onpointerdown={(e) => rooms?.summon(e)}
						style="clip-path: {MARK_CLIP_PATH}; top: calc(-1 * var(--bar-mark-rise)); height: var(--bar-mark); width: var(--bar-mark)"
						class="tap tap-shape pie-handle absolute left-1/2 flex -translate-x-1/2 items-center justify-center {roomsOpen
							? 'pie-handle-held text-chrome-ink'
							: 'text-chrome-muted'}"
						aria-label={t('home.goToASection')}
						title={t('home.goToASection')}
						data-tour="rooms"
					>
						<!-- Edge to edge: the button's own outline is the mark's, so any
						     inset here would show as a gap inside its own shape. The
						     size comes from the button rather than from a number of its
						     own, which is how the two came apart before. -->
						<Logo fill />
					</button>
				</div>

				<button
					onpointerdown={(e) => pie?.summon(e)}
					class="tap pie-handle flex flex-1 items-center justify-center {pieOpen
						? 'pie-handle-held text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label={t('home.writeSomethingDown')}
					title={t('home.writeSomethingDown')}
					data-tour="capture"
				>
					<Icon name="plus" size={24} />
				</button>

				<!--
					Not a link any more: the press opens the flower of small things
					above the thumb, with the account at its middle — this icon,
					flown up and grown, which is why it leaves while that is up. On a device that is
					its own instance there is no account to open — no address, no
					sessions, nothing anybody else can see — and that petal goes
					to the preferences, which it does have.
				-->
				<button
					type="button"
					onpointerdown={summonFan}
					class="tap pie-handle flex flex-1 items-center justify-center {fanOpen
						? 'pie-handle-held text-chrome-ink'
						: page.url.pathname.startsWith('/settings') || page.url.pathname === '/instance'
							? 'text-chrome-ink'
							: 'text-chrome-muted'}"
					aria-haspopup="menu"
					aria-expanded={fanOpen}
					aria-label={t('home.accountAndHelp')}
					title={t('home.accountAndHelp')}
					data-tour="menu"
				>
					<span class="relative inline-flex">
						<Icon name="user" size={22} />
						{#if (data.unreadNotifications ?? 0) > 0}
							<!--
								A dot, and no number.

								Out here a number would be smaller than the thing it counts,
								and all a bar has to say is that something happened. The
								count is one press away, on the petal that leads to it.
							-->
							<span
								class="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-red-600"
								aria-hidden="true"
								data-unread-dot
							></span>
						{/if}
					</span>
				</button>
			</div>
		</nav>

		{#if data.demo}
			<!--
				On a phone: a strip sitting on top of the bottom bar, one line
				tall, its top edge level with the top of the raised pie button
				— which is 1.95rem proud of the bar, hence the height. Behind the
				bar in z-order, so the button tucks into it rather than floating
				over a gap.

				Fixed rather than in the page because on the demo every page is
				somebody's first, and a band that scrolls away is one the visitor
				never sees.
			-->
			<div
				class="fixed inset-x-0 z-30 flex items-center justify-between bg-amber-500 px-3 text-[11px] leading-none font-medium text-amber-950 lg:hidden"
				style="bottom: calc(var(--mobile-nav-height) + var(--safe-bottom)); height: 1.95rem"
			>
				<!-- Two words, split around the pie button that sits in the middle of
				     this strip. Anything longer was cut off by the menu button and
				     read as "one shared a—", which says less than nothing. -->
				<span><strong>{t('home.demoVersion')}</strong></span>
				<!-- Clear of the help dock, which floats over this corner. -->
				<span class="pe-10">{t('home.yoursAndTemporary')}</span>
			</div>
		{/if}

		<!-- The dock is a wide screen's affordance now: on a phone its square
		     sat over the corner of every page, and the fan replaced it. -->
		<div class="hidden lg:contents">
			<HelpDock demo={data.demo} onstart={() => tour?.start(true)} />
		</div>
		<FanMenu
			items={fanItems}
			open={fanOpen}
			origin={fanOrigin}
			dragging={fanDragging}
			onselect={chooseFan}
			onclose={() => (fanOpen = false)}
		/>
		<ReportDialog open={reporting} onclose={() => (reporting = false)} />
		<Tutorial bind:this={tour} accent={section.accent} ondismiss={tourDismissed} />
		<CommandPalette hidden={data.hiddenSections} />
		<CapturePie bind:this={pie} onopenchange={(v) => (pieOpen = v)} hidden={data.hiddenSections} />
		<NavPie
			bind:this={rooms}
			onopenchange={(v) => (roomsOpen = v)}
			hidden={data.hiddenSections}
			order={data.navOrder}
			colors={data.sectionColors}
		/>
		<!-- Every `title` in the app, drawn by the app rather than by the
		     browser. One listener; nothing else changes. -->
		<Tooltips />
		<!--
			The list, on the phone, opened from the fan.

			A dialog rather than the desktop's dropdown: there is nothing to hang
			a dropdown off out here — the fan it came from has already closed.
		-->
		<Modal bind:open={phoneNotifications} title={t('notifications.title')} size="sm">
			<NotificationPanel
				held={data.notifications ?? []}
				unread={data.unreadNotifications ?? 0}
				onpick={() => (phoneNotifications = false)}
			/>
		</Modal>

		<Reminders />
		<UndoToast />
		<Notifications />
		{#if data.clientErrorReports !== 'off'}
			<ClientErrorPrompt state={data.clientErrorReports} />
		{/if}
	</div>
{:else}
	{@render children()}
{/if}

<style>
	/*
	 * Every handle a pie hangs off.
	 *
	 * A press-and-hold on one of these is the gesture; without `touch-action`
	 * and `user-select` the browser reads it as a scroll or a text selection,
	 * takes it over, and the release never reaches the menu.
	 */
	.pie-handle {
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
</style>
