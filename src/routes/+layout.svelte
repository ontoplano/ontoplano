<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { LayoutServerData } from './$types';
	import { NAV_DROPDOWN_ITEM, SECTIONS, sectionFor } from '$lib/colors.js';
	import { THEMES } from '$lib/theme.js';
	import type { SectionKey } from '$lib/colors.js';
	import ShortcutHelp from '$lib/components/ShortcutHelp.svelte';

	let { children, data }: { children: any; data: LayoutServerData } = $props();
	let menuOpen = $state(false);

	function categoryStyle(): string {
		return data.categories
			.map(
				(c: { id: number; name: string; color: string; colorLight: string }) =>
					`--color-cat-${c.id}:${c.color};--color-cat-${c.id}-light:${c.colorLight}`
			)
			.join(';');
	}

	const nav: { href: string; label: string; section: SectionKey; icon: string }[] = [
		// `icon` is an SVG path drawn at 24x24. Inline rather than an icon package:
		// seven glyphs is not worth a dependency that ships to a webview.
		{ href: '/', label: 'Home', section: 'home', icon: 'M3 10.5 12 3l9 7.5V21H3z' },
		{
			href: '/planner/board',
			label: 'Planner',
			section: 'planner',
			icon: 'M4 5h16v16H4zM4 9h16M9 9v12M15 9v12'
		},
		{ href: '/goals', label: 'Goals', section: 'goals', icon: 'M12 3v18M4 6h14l-3 4 3 4H4z' },
		{
			href: '/diary',
			label: 'Diary',
			section: 'diary',
			icon: 'M5 3h14v18H5zM9 3v18M12 8h4M12 12h4'
		},
		{
			href: '/ideas',
			label: 'Ideas',
			section: 'ideas',
			icon: 'M9 21h6M10 18h4M12 3a6 6 0 0 1 4 10.5V16H8v-2.5A6 6 0 0 1 12 3z'
		},
		{ href: '/health/habits', label: 'Health', section: 'health', icon: 'M3 12h4l2 6 4-14 2 8h6' },
		{
			href: '/shopping',
			label: 'Shopping',
			section: 'shopping',
			icon: 'M4 7h16l-1.5 12h-13zM9 7V5a3 3 0 0 1 6 0v2'
		}
	];

	/**
	 * The bottom bar holds four; the rest live behind More.
	 *
	 * Four is what fits at 360px without the labels truncating, and a bar you
	 * cannot read the labels on is just a row of mystery glyphs.
	 */
	const PRIMARY_NAV_COUNT = 4;
	const primaryNav = $derived(nav.slice(0, PRIMARY_NAV_COUNT));
	const secondaryNav = $derived(nav.slice(PRIMARY_NAV_COUNT));

	let moreOpen = $state(false);
	const secondaryActive = $derived(secondaryNav.some((item) => isNavActive(item.href)));

	/** The section being viewed. Its accent fills the active nav tab. */
	const section = $derived(SECTIONS[sectionFor(page.url.pathname)]);

	function isNavActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		if (href === '/planner/track') return page.url.pathname.startsWith('/planner');
		if (href === '/goals') return page.url.pathname.startsWith('/goals');
		if (href === '/health/habits') return page.url.pathname.startsWith('/health');
		return page.url.pathname === href;
	}

	import { GLOBAL_SHORTCUTS } from '$lib/shortcuts';

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
				goto(nav[next].href);
				break;
			}
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (menuOpen) {
			const target = e.target as HTMLElement;
			if (!target.closest('.menu-container')) {
				menuOpen = false;
			}
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} onclick={handleClickOutside} />

{#if data.user}
	<div
		class="flex min-h-screen flex-col bg-gray-100"
		style="{categoryStyle()};--section-accent:{section.accent}"
	>
		<header class="bg-chrome shadow-raised" style="padding-top: var(--safe-top)">
			<div class="mx-auto flex max-w-5xl items-stretch justify-between px-4">
				<div class="flex items-stretch gap-6">
					<a href="/" class="flex items-center text-lg font-bold tracking-tight text-chrome-ink"
						>ontoplano</a
					>
					<!-- The word-nav needs more width than a phone has; below md the
					     bottom bar takes over. -->
					<nav class="hidden md:flex">
						{#each nav as item (item.href)}
							{@const active = isNavActive(item.href)}
							<!-- Active tab is a solid block of its section colour; the rest stay
							     neutral so the fill is the thing that reads. -->
							<a
								href={item.href}
								class="flex items-center border-b-2 px-3 py-4 text-sm transition-colors {active
									? 'font-semibold text-chrome-ink'
									: 'border-transparent font-medium text-chrome-muted hover:text-chrome-ink'}"
								style={active ? `border-color: ${SECTIONS[item.section].accent}` : ''}
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</div>
				<div class="menu-container relative hidden items-center gap-3 md:flex">
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
							class="rise absolute top-full right-0 mt-1 w-44 border border-gray-200 bg-white shadow-overlay"
						>
							<div class="border-b border-gray-200 px-4 py-2">
								<span class="eyebrow text-gray-500">Theme</span>
								<form
									method="post"
									action="/config?/setTheme"
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
								href="/account"
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								Account
							</a>
							<a
								href="/settings/integrations"
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								Integrations
							</a>
							<a
								href="/config"
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm {NAV_DROPDOWN_ITEM} transition"
							>
								Config
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
		<!-- The bottom bar floats over the page, so the last card needs clearance
		     or it sits underneath it forever. -->
		<main
			class="mx-auto w-full max-w-5xl flex-1 px-4 py-6"
			style="padding-bottom: calc(var(--mobile-nav-height) + var(--safe-bottom) + 1.5rem)"
		>
			{@render children()}
		</main>

		<!-- Thumb-zone navigation. Primary actions belong where a thumb rests,
		     not in a corner reachable only by shifting grip. -->
		<nav
			class="fixed inset-x-0 bottom-0 z-40 border-t border-chrome-line bg-chrome md:hidden"
			style="padding-bottom: var(--safe-bottom)"
			aria-label="Primary"
		>
			<div class="flex" style="height: var(--mobile-nav-height)">
				{#each primaryNav as item (item.href)}
					{@const active = isNavActive(item.href)}
					<a
						href={item.href}
						class="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] {active
							? 'font-semibold text-chrome-ink'
							: 'text-chrome-muted'}"
						aria-current={active ? 'page' : undefined}
					>
						<svg
							class="h-5 w-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
							stroke-linecap="square"
							aria-hidden="true"
						>
							<path d={item.icon} />
						</svg>
						{item.label}
						<span
							class="h-0.5 w-6"
							style="background-color: {active ? SECTIONS[item.section].accent : 'transparent'}"
						></span>
					</a>
				{/each}

				<button
					onclick={() => (moreOpen = !moreOpen)}
					class="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] {secondaryActive ||
					moreOpen
						? 'font-semibold text-chrome-ink'
						: 'text-chrome-muted'}"
					aria-expanded={moreOpen}
				>
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="square"
						aria-hidden="true"
					>
						<path d="M5 12h.01M12 12h.01M19 12h.01" />
					</svg>
					More
					<span
						class="h-0.5 w-6"
						style="background-color: {secondaryActive ? 'currentColor' : 'transparent'}"
					></span>
				</button>
			</div>
		</nav>

		{#if moreOpen}
			<!-- A sheet rather than a dropdown: it opens upward from the bar that
			     spawned it, which is also where the thumb already is. -->
			<button
				class="fixed inset-0 z-40 bg-black/40 md:hidden"
				onclick={() => (moreOpen = false)}
				aria-label="Close menu"
			></button>
			<div
				class="rise fixed inset-x-0 z-50 border-t border-gray-200 bg-white md:hidden"
				style="bottom: calc(var(--mobile-nav-height) + var(--safe-bottom))"
			>
				<div class="divide-y divide-gray-200">
					{#each secondaryNav as item (item.href)}
						<a
							href={item.href}
							onclick={() => (moreOpen = false)}
							class="flex items-center gap-3 px-4 py-3 text-sm text-gray-900"
						>
							<svg
								class="h-5 w-5 text-gray-400"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="square"
								aria-hidden="true"
							>
								<path d={item.icon} />
							</svg>
							{item.label}
						</a>
					{/each}
					<a
						href="/account"
						onclick={() => (moreOpen = false)}
						class="block px-4 py-3 text-sm text-gray-900">Account</a
					>
					<a
						href="/config"
						onclick={() => (moreOpen = false)}
						class="block px-4 py-3 text-sm text-gray-900">Config</a
					>
					<form method="post" action="/login?/signOut" use:enhance>
						<button type="submit" class="w-full px-4 py-3 text-left text-sm text-gray-900"
							>Sign out</button
						>
					</form>
				</div>
			</div>
		{/if}
		<ShortcutHelp />
	</div>
{:else}
	{@render children()}
{/if}
