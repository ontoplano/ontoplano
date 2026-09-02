<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import type { LayoutServerData } from './$types';
	import { NAV_DROPDOWN_ITEM, SECTIONS, sectionFor } from '$lib/colors.js';
	import { NAV_PLACES } from '$lib/sections-nav';
	import { accentsWith, placesFor } from '$lib/nav-order';
	import { MARK_CLIP_PATH } from '$lib/logo/mark-shape';
	import { THEMES } from '$lib/theme.js';
	import type { SectionKey } from '$lib/colors.js';
	import SectionPattern from '$lib/components/SectionPattern.svelte';
	import HelpDock from '$lib/components/HelpDock.svelte';
	import Tutorial from '$lib/components/Tutorial.svelte';
	import CapturePie from '$lib/components/CapturePie.svelte';
	import NavPie from '$lib/components/NavPie.svelte';
	import Logo from '$lib/components/Logo.svelte';
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
	import { smartNumberFields } from '$lib/number-fields';
	import type { Snippet } from 'svelte';

	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();

	// Autofill is opt-in: see $lib/autofill. Once, for every form the app ever mounts.
	$effect(() => suppressAutofill(document.body));
	// And once for every number box: clicking one selects what is in it, so
	// typing 2 into a field showing 0 gives 2 rather than 02.
	$effect(() => smartNumberFields(document));
	let menuOpen = $state(false);
	let pie = $state<CapturePie | undefined>();
	let rooms = $state<NavPie | undefined>();
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
	 * anybody is signed in.
	 */
	const bareScreen = $derived(
		['/welcome', '/login/verify', '/start', '/buy'].includes(page.url.pathname) ||
			page.url.pathname.startsWith('/legal')
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
		shopping: 'shopping',
		kitchen: 'utensils'
	};

	/**
	 * The glyph behind the page, where the section is not specific enough.
	 *
	 * People and Notebooks both belong to the Diary section, so keying the
	 * background off the section alone drew a journal behind all three — and the
	 * whole point of the wash is that a room looks like itself. Longest prefix
	 * wins, so `/diary/notebooks` beats `/diary`.
	 */
	const ROUTE_GLYPH: [string, IconName][] = [
		['/diary/notebooks', 'notebook'],
		['/diary/people', 'user'],
		['/kitchen/recipes', 'utensils'],
		['/kitchen/meals', 'utensils'],
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
		// People and notebooks sit beside the journal in the bar, not under it, so
		// Diary means the entries and nothing else.
		if (href === '/diary') return page.url.pathname === '/diary';
		if (href === '/planner/plan') return page.url.pathname.startsWith('/planner');
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

	afterNavigate(() => scroller?.scrollTo({ top: 0 }));

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
				The demo says so at the very top, where the impersonation band
				says its piece — the two are the same kind of statement: this
				page is not what it looks like. Above `lg` only; the phone gets
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
					<strong>This is a demo version of ontoplano.</strong>
					<strong class="text-red-900">
						Do not put your real data here — this account is wiped once you stop using it.
					</strong>
				</span>
				{#if data.demoHost}
					<span class="font-normal">Open {data.demoHost} on your phone to see it there too.</span>
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
			<div
				class="relative z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950"
			>
				<span>
					<strong>Staging.</strong> A copy of Ontoplano for trying things on.
					<strong class="text-red-900">Nothing here is promised to survive.</strong>
				</span>
			</div>
		{/if}

		{#if data.impersonatedBy}
			<!--
				Loud on purpose. An administrator looking at somebody's account is a
				thing that has to be visible while it is happening, not only in a log
				afterwards.
			-->
			<div
				class="relative z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950"
			>
				<span>
					You are signed in as <strong>{data.user.email}</strong> from an administrator account. Everything
					you do here is theirs.
				</span>
				<form method="post" action="/admin/stop">
					<button
						class="border border-amber-900 px-2 py-1 text-xs font-semibold hover:bg-amber-400"
					>
						Stop
					</button>
				</form>
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
					<a
						href={resolve('/')}
						class="flex shrink-0 items-center text-lg font-bold tracking-tight whitespace-nowrap text-chrome-ink"
						>ontoplano</a
					>
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
								title={item.label}
								class="flex shrink-0 items-center gap-1 border-b-2 px-3 py-4 text-sm whitespace-nowrap transition-colors min-[1460px]:gap-1.5 min-[1460px]:px-3 xl:px-1.5 [&>svg]:h-5 [&>svg]:w-5 xl:[&>svg]:h-4 xl:[&>svg]:w-4 {active
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
								<span class="hidden xl:inline">{item.label}</span>
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
						Search
						<kbd
							class="kbd-hint ml-auto hidden border border-chrome-line px-1 text-xs min-[1460px]:inline-block"
							>{key} K</kbd
						>
					</button>
					<!--
						The rooms, as a pie.

						The bar above tells you where you are and ⌘K is faster once you
						know it exists; this is the one for a hand on the mouse. Alongside
						the bar on purpose — if the bar goes untouched for a fortnight it
						can go, and if it does not, nothing was lost.
					-->
					<button
						onpointerdown={(e) => rooms?.summon(e)}
						class="pie-handle flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125"
						aria-label="Jump to a section"
						title="Jump to a section"
						data-tour="rooms"
					>
						<Logo size={18} />
					</button>

					<!-- Capture, beside search: the two things you reach for without
					     having decided where you are going. -->
					<button
						onpointerdown={(e) => pie?.summon(e)}
						class="pie-handle flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125"
						aria-label="Write something down"
						title="Write something down"
						data-tour="capture"
					>
						<Icon name="plus" size={16} />
					</button>
					<span class="text-sm text-chrome-muted">{data.user.name}</span>
					<button
						onclick={() => (menuOpen = !menuOpen)}
						class="flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125"
						aria-label="Menu"
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
								<span class="eyebrow text-gray-600">Theme</span>
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
							<a
								href={resolve('/settings/account')}
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								Account
							</a>
							<a
								href={resolve('/settings/preferences')}
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								Preferences
							</a>
							<a
								href={resolve('/settings/integrations')}
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								Integrations
							</a>
							<!--
								Not on the demo. The account was handed over by a cookie and
								has no password anybody knows, so signing out of it is leaving
								for good — the visit ends and the door does not reopen. The
								endpoint refuses too; this is so nobody is offered the button
								in the first place.
							-->
							{#if !data.demo}
								<form method="post" action="/login?/signOut" use:enhance>
									<button
										type="submit"
										class="w-full px-4 py-2 text-left text-sm {NAV_DROPDOWN_ITEM} transition"
									>
										Sign out
									</button>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</header>
		<main
			bind:this={scroller}
			class="relative z-10 mx-auto w-full max-w-page flex-1 overflow-y-auto overscroll-y-contain px-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--mobile-nav-height)+var(--safe-bottom)+0.75rem)] sm:px-6 lg:overflow-visible lg:pt-6 lg:pb-6"
		>
			<!--
				No entrance animation, and no `{#key}` around the page.

				It used to be keyed on the pathname with a 6px rise, so arriving
				anywhere replayed a small step upward. What that actually did was
				throw away and rebuild the whole subtree on every navigation —
				including any nested layout's own chrome. Switching between two
				Settings tabs made the tab row itself jump, which is the one part of
				the screen that did not change and the one part the eye is fixed on
				while clicking.

				A page that simply swaps its contents is smoother than any animation
				of it, so there is nothing here to animate.
			-->
			{@render children()}
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
		<nav
			class="fixed inset-x-0 bottom-0 z-40 border-t border-chrome-line bg-chrome lg:hidden"
			style="padding-bottom: var(--safe-bottom)"
			aria-label="Primary"
			data-tour="mobile-bar"
		>
			<div class="flex" style="height: var(--mobile-nav-height)">
				<!--
					The account, so it wears a person. It used to wear the settings
					glyph, which was a sun with rays: on a phone bar, next to search
					and a plus, that reads as a brightness control and nothing else.
				-->
				<a
					href={resolve('/settings/account')}
					class="tap flex flex-1 items-center justify-center {page.url.pathname.startsWith(
						'/settings'
					)
						? 'text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label="Account"
					title="Account"
					data-tour="menu"
				>
					<Icon name="user" size={22} />
				</a>

				<button
					type="button"
					onclick={() => (palette.open = true)}
					class="tap flex flex-1 items-center justify-center text-chrome-muted"
					aria-label="Search"
					title="Search"
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
					<button
						onpointerdown={(e) => rooms?.summon(e)}
						style="clip-path: {MARK_CLIP_PATH}"
						class="tap tap-shape pie-handle absolute -top-9 left-1/2 flex h-24 w-24 -translate-x-1/2 items-center justify-center {roomsOpen
							? 'text-chrome-ink'
							: 'text-chrome-muted'}"
						aria-label="Go to a section"
						title="Go to a section"
						data-tour="rooms"
					>
						<!-- Edge to edge: the button's own outline is the mark's, so any
						     inset here would show as a gap inside its own shape. -->
						<Logo size={96} />
					</button>
				</div>

				<!-- Home by name, since the pie no longer offers it. -->
				<a
					href={resolve('/')}
					class="tap flex flex-1 items-center justify-center {page.url.pathname === '/'
						? 'text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label="Home"
					title="Home"
				>
					<Icon name="home" size={22} />
				</a>

				<button
					onpointerdown={(e) => pie?.summon(e)}
					class="tap pie-handle flex flex-1 items-center justify-center {pieOpen
						? 'text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label="Write something down"
					title="Write something down"
					data-tour="capture"
				>
					<Icon name="plus" size={24} />
				</button>
			</div>
		</nav>

		{#if data.demo}
			<!--
				On a phone: a strip sitting on top of the bottom bar, one line
				tall, its top edge level with the top of the raised pie button
				— which is 2.25rem proud of the bar, hence the height. Behind the
				bar in z-order, so the button tucks into it rather than floating
				over a gap.

				Fixed rather than in the page because on the demo every page is
				somebody's first, and a band that scrolls away is one the visitor
				never sees.
			-->
			<div
				class="fixed inset-x-0 z-30 flex items-center justify-between bg-amber-500 px-3 text-[11px] leading-none font-medium text-amber-950 lg:hidden"
				style="bottom: calc(var(--mobile-nav-height) + var(--safe-bottom)); height: 2.25rem"
			>
				<!-- Two words, split around the pie button that sits in the middle of
				     this strip. Anything longer was cut off by the menu button and
				     read as "one shared a—", which says less than nothing. -->
				<span><strong>Demo version</strong></span>
				<span>yours, and temporary</span>
			</div>
		{/if}

		<HelpDock demo={data.demo} onstart={() => tour?.start()} />
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
