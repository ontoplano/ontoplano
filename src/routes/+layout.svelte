<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import type { LayoutServerData } from './$types';
	import { NAV_DROPDOWN_ITEM, SECTIONS, sectionFor } from '$lib/colors.js';
	import { THEMES } from '$lib/theme.js';
	import type { SectionKey } from '$lib/colors.js';
	import type { HideableSection } from '$lib/sections.js';
	import SectionPattern from '$lib/components/SectionPattern.svelte';
	import ShortcutHelp from '$lib/components/ShortcutHelp.svelte';
	import CapturePie from '$lib/components/CapturePie.svelte';
	import NavPie from '$lib/components/NavPie.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Reminders from '$lib/components/Reminders.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import Notifications from '$lib/components/Notifications.svelte';
	import ClientErrorPrompt from '$lib/components/ClientErrorPrompt.svelte';
	import { undo } from '$lib/undo.svelte';
	import { palette } from '$lib/palette.svelte';
	import type { IconName } from '$lib/components/Icon.svelte';
	import { suppressAutofill } from '$lib/autofill';
	import type { Snippet } from 'svelte';
	import type { Pathname } from '$app/types';

	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();

	// Autofill is opt-in: see $lib/autofill. Once, for every form the app ever mounts.
	$effect(() => suppressAutofill(document.body));
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

	const allNav: {
		/** A real route, so a tab pointing at one that does not exist fails the build. */
		href: Pathname;
		label: string;
		section: SectionKey;
		icon: string;
		/** Which preference toggle puts this tab away. Absent means always on. */
		hide?: HideableSection;
	}[] = [
		// `icon` is an SVG path drawn at 24x24. Inline rather than an icon package:
		// nine glyphs is not worth a dependency that ships to a webview.
		{ href: '/', label: 'Home', section: 'home', icon: 'M3 10.5 12 3l9 7.5V21H3z' },
		{
			href: '/planner/plan',
			label: 'Planner',
			section: 'planner',
			icon: 'M4 5h16v16H4zM4 9h16M9 9v12M15 9v12'
		},
		{
			href: '/goals',
			label: 'Goals',
			section: 'goals',
			icon: 'M12 3v18M4 6h14l-3 4 3 4H4z',
			hide: 'goals'
		},
		{
			href: '/diary',
			label: 'Diary',
			section: 'diary',
			icon: 'M5 3h14v18H5zM9 3v18M12 8h4M12 12h4',
			hide: 'diary'
		},
		{
			href: '/diary/people',
			label: 'People',
			section: 'diary',
			icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
			hide: 'people'
		},
		{
			href: '/diary/notebooks',
			label: 'Notebooks',
			section: 'diary',
			icon: 'M7 4h12v17H7zM7 8H4M7 12H4M7 16H4',
			hide: 'notebooks'
		},
		{
			href: '/ideas',
			label: 'Ideas',
			section: 'ideas',
			icon: 'M9 21h6M10 18h4M12 3a6 6 0 0 1 4 10.5V16H8v-2.5A6 6 0 0 1 12 3z',
			hide: 'ideas'
		},
		{
			href: '/health/habits',
			label: 'Health',
			section: 'health',
			icon: 'M3 12h4l2 6 4-14 2 8h6',
			hide: 'health'
		},
		{
			href: '/shopping',
			label: 'Shopping',
			section: 'shopping',
			icon: 'M4 7h16l-1.5 12h-13zM9 7V5a3 3 0 0 1 6 0v2',
			hide: 'shopping'
		},
		{
			href: '/kitchen/recipes',
			label: 'Recipes',
			section: 'kitchen',
			icon: 'M8 3v8a3 3 0 0 0 6 0V3M11 11v10M17 3c-1.5 2-2 3.5-2 6v3h4V9c0-2.5-.5-4-2-6zM17 12v9',
			hide: 'recipes'
		}
	];

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
	const section = $derived(SECTIONS[sectionKey]);

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
				<span>
					<strong>This is a demo version of ontoplano.</strong> One shared account, wiped and reseeded
					every now and then.
				</span>
				{#if data.demoHost}
					<span class="font-normal">Open {data.demoHost} on your phone to see it there too.</span>
				{/if}
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
					<nav class="hidden min-w-0 overflow-x-auto lg:flex">
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
								class="flex shrink-0 items-center gap-1 border-b-2 px-1.5 py-4 text-sm whitespace-nowrap transition-colors min-[1460px]:gap-1.5 min-[1460px]:px-3 {active
									? 'font-semibold text-chrome-ink'
									: 'border-transparent font-medium text-chrome-muted hover:border-chrome-line hover:text-chrome-ink'}"
								style={active ? `border-color: ${SECTIONS[item.section].accent}` : ''}
							>
								<svg
									class="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="square"
									aria-hidden="true"
								>
									<path d={item.icon} />
								</svg>
								<!--
									Ten first-class sections, squeezed rather than grouped. Every
									one of these is somewhere you go, and burying four of them
									behind a "Write" menu to save a hundred pixels makes them
									harder to find rather than easier. Words from 1280px up; below
									that the glyphs carry it, with `title` saying the word.
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
					>
						<Icon name="plus" size={16} />
					</button>
					<span class="text-sm text-chrome-muted">{data.user.name}</span>
					<button
						onclick={() => (menuOpen = !menuOpen)}
						class="flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125"
						aria-label="Menu"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
							<form method="post" action="/login?/signOut" use:enhance>
								<button
									type="submit"
									class="w-full px-4 py-2 text-left text-sm {NAV_DROPDOWN_ITEM} transition"
								>
									Sign out
								</button>
							</form>
						</div>
					{/if}
				</div>
			</div>
		</header>
		<main
			bind:this={scroller}
			class="relative z-10 mx-auto w-full max-w-page flex-1 overflow-y-auto overscroll-y-contain px-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--mobile-nav-height)+var(--safe-bottom)+0.75rem)] sm:px-6 lg:overflow-visible lg:pt-6 lg:pb-6"
		>
			<!-- Keyed so arriving on a page replays its entrance. The movement is
			     transform alone — an opacity animation here is a flash of the page
			     background on every navigation, which was tried and hated. -->
			{#key page.url.pathname}
				<div class="page-enter">
					{@render children()}
				</div>
			{/key}
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
		>
			<div class="flex" style="height: var(--mobile-nav-height)">
				<!--
					The account, so it wears a person. It used to wear the settings
					glyph, which was a sun with rays: on a phone bar, next to search
					and a plus, that reads as a brightness control and nothing else.
				-->
				<a
					href={resolve('/settings/account')}
					class="flex flex-1 items-center justify-center {page.url.pathname.startsWith('/settings')
						? 'text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label="Account"
					title="Account"
				>
					<Icon name="user" size={22} />
				</a>

				<button
					type="button"
					onclick={() => (palette.open = true)}
					class="flex flex-1 items-center justify-center text-chrome-muted"
					aria-label="Search"
					title="Search"
				>
					<Icon name="search" size={22} />
				</button>

				<!--
					The rooms, raised out of the middle of the bar the way a docked
					action button is: the one control here that opens a gesture rather
					than a page earns the bump that says "this one is different".
				-->
				<div class="relative flex-1">
					<button
						onpointerdown={(e) => rooms?.summon(e)}
						class="pie-handle pie-bump absolute -top-6 left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center border border-chrome-line bg-chrome shadow-overlay {roomsOpen
							? 'text-chrome-ink'
							: 'text-chrome-muted'}"
						aria-label="Go to a section"
						title="Go to a section"
					>
						<!-- The logo, bigger than its neighbours on purpose: this is
						     the way into everything, and the bar's one raised control.
						     The mark lives in $lib/logo/mark.svg and nothing here
						     knows what is in it. No ground behind it — the chrome is
						     already that colour, in both themes. -->
						<Logo size={32} />
					</button>
				</div>

				<!-- Home by name, since the pie no longer offers it. -->
				<a
					href={resolve('/')}
					class="flex flex-1 items-center justify-center {page.url.pathname === '/'
						? 'text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label="Home"
					title="Home"
				>
					<Icon name="home" size={22} />
				</a>

				<button
					onpointerdown={(e) => pie?.summon(e)}
					class="pie-handle flex flex-1 items-center justify-center {pieOpen
						? 'text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-label="Write something down"
					title="Write something down"
				>
					<Icon name="plus" size={24} />
				</button>
			</div>
		</nav>

		{#if data.demo}
			<!--
				On a phone: a strip sitting on top of the bottom bar, one line
				tall, its top edge level with the top of the raised pie button
				— which is 1.5rem proud of the bar, hence the height. Behind the
				bar in z-order, so the button tucks into it rather than floating
				over a gap.

				Fixed rather than in the page because on the demo every page is
				somebody's first, and a band that scrolls away is one the visitor
				never sees.
			-->
			<div
				class="fixed inset-x-0 z-30 flex items-center justify-between bg-amber-500 px-3 text-[11px] leading-none font-medium text-amber-950 lg:hidden"
				style="bottom: calc(var(--mobile-nav-height) + var(--safe-bottom)); height: 1.5rem"
			>
				<!-- Split around the pie button, which sits in the middle of this
				     strip and would otherwise cover the words. -->
				<span><strong>Demo version</strong> · one shared account</span>
				<span>wiped regularly</span>
			</div>
		{/if}

		<ShortcutHelp />
		<CommandPalette hidden={data.hiddenSections} />
		<CapturePie bind:this={pie} onopenchange={(v) => (pieOpen = v)} hidden={data.hiddenSections} />
		<NavPie bind:this={rooms} onopenchange={(v) => (roomsOpen = v)} hidden={data.hiddenSections} />
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
