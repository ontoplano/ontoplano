<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { LayoutServerData } from './$types';

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

	const nav = [
		{ href: '/', label: 'Home' },
		{ href: '/planner/track', label: 'Planner' },
		{ href: '/diary', label: 'Diary' },
		{ href: '/habits', label: 'Habits' },
		{ href: '/beliefs', label: 'Beliefs' }
	];

	function isNavActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		if (href === '/planner/track') return page.url.pathname.startsWith('/planner');
		return page.url.pathname === href;
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'J' || e.key === 'K') {
			e.preventDefault();
			let currentIdx = nav.findIndex((item) => isNavActive(item.href));
			const idx = currentIdx === -1 ? 0 : currentIdx;
			const next = e.key === 'J' ? (idx + 1) % nav.length : (idx - 1 + nav.length) % nav.length;
			goto(nav[next].href);
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
	<div class="flex min-h-screen flex-col bg-slate-50/80" style={categoryStyle()}>
		<header
			class="border-b border-gray-200/60 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 shadow-sm"
		>
			<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
				<div class="flex items-center gap-6">
					<a href="/" class="text-lg font-bold tracking-tight text-gray-900">semotina</a>
					<nav class="flex gap-1">
						{#each nav as item}
							<a
								href={item.href}
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {isNavActive(
									item.href
								)
									? 'bg-gray-900/10 text-gray-900'
									: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}"
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</div>
				<div class="menu-container relative flex items-center gap-3">
					<span class="text-sm text-gray-500">{data.user.name}</span>
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
								href="/config"
								onclick={() => (menuOpen = false)}
								class="block px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
							>
								Config
							</a>
							<form method="post" action="/login?/signOut" use:enhance>
								<button
									type="submit"
									class="w-full px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
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
	</div>
{:else}
	{@render children()}
{/if}
