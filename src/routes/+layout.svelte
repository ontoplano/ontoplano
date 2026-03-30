<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { LayoutServerData } from './$types';

	let { children, data }: { children: any; data: LayoutServerData } = $props();

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/activities', label: 'Activities' },
		{ href: '/planner', label: 'Planner' }
	];

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'J' || e.key === 'K') {
			e.preventDefault();
			const currentIdx = nav.findIndex((item) => item.href === page.url.pathname);
			const idx = currentIdx === -1 ? 0 : currentIdx;
			const next = e.key === 'J' ? (idx + 1) % nav.length : (idx - 1 + nav.length) % nav.length;
			goto(nav[next].href);
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if data.user}
	<div class="flex min-h-screen flex-col bg-gray-50">
		<header class="border-b border-gray-200 bg-white shadow-sm">
			<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
				<div class="flex items-center gap-6">
					<a href="/" class="text-lg font-bold tracking-tight text-gray-900">semotina</a>
					<nav class="flex gap-4">
						{#each nav as item}
							<a
								href={item.href}
								class="text-sm font-medium transition-colors {page.url.pathname === item.href
									? 'text-gray-900 underline underline-offset-4'
									: 'text-gray-500 hover:text-gray-900'}"
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</div>
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-500">{data.user.name}</span>
					<form method="post" action="/login?/signOut" use:enhance>
						<button
							class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
						>
							Sign out
						</button>
					</form>
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
