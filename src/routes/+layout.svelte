<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { LayoutServerData } from './$types';
	import { NAV_USER_TEXT, NAV_DROPDOWN_ITEM, SECTIONS, sectionFor } from '$lib/colors.js';
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

	const nav: { href: string; label: string; section: SectionKey }[] = [
		{ href: '/', label: 'Home', section: 'home' },
		{ href: '/planner/track', label: 'Planner', section: 'planner' },
		{ href: '/diary', label: 'Diary', section: 'diary' },
		{ href: '/ideas', label: 'Ideas', section: 'ideas' },
		{ href: '/health/habits', label: 'Health', section: 'health' },
		{ href: '/shopping', label: 'Shopping', section: 'shopping' }
	];

	/** The section being viewed, which colours the page wash and the header rule. */
	const section = $derived(SECTIONS[sectionFor(page.url.pathname)]);

	function isNavActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		if (href === '/planner/track') return page.url.pathname.startsWith('/planner');
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
		class="flex min-h-screen flex-col"
		style="{categoryStyle()};--section-accent:{section.accent};--section-tint:{section.tint};background-color:{section.tint}"
	>
		<header class="border-b border-gray-200 bg-white shadow-sm">
			<!-- The one place the current section is stated in colour alone; the
			     active nav link says it again in words. -->
			<div class="h-1 w-full" style="background-color: {section.accent}"></div>
			<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
				<div class="flex items-center gap-6">
					<a href="/" class="text-lg font-bold tracking-tight text-gray-900">ontoplano</a>
					<nav class="flex gap-4">
						{#each nav as item (item.href)}
							{@const active = isNavActive(item.href)}
							<a
								href={item.href}
								class="border-b-2 pb-0.5 text-sm font-medium transition-colors {active
									? 'font-semibold'
									: 'border-transparent opacity-70 hover:opacity-100'}"
								style="color: {SECTIONS[item.section].accent}; border-color: {active
									? SECTIONS[item.section].accent
									: 'transparent'}"
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</div>
				<div class="menu-container relative flex items-center gap-3">
					<span class="text-sm {NAV_USER_TEXT}">{data.user.name}</span>
					<button
						onclick={() => (menuOpen = !menuOpen)}
						class="flex h-8 w-8 items-center justify-center border border-gray-300 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50"
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
							class="absolute top-full right-0 mt-1 w-40 border border-gray-200 bg-white shadow-sm"
						>
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
		<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
			{@render children()}
		</main>
		<ShortcutHelp />
	</div>
{:else}
	{@render children()}
{/if}
