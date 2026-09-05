<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import './legal.css';

	let { children }: { children: Snippet } = $props();

	const pages = [
		{ path: '/legal/privacy', label: 'Privacy' },
		{ path: '/legal/terms', label: 'Terms' },
		{ path: '/legal/refunds', label: 'Refunds' }
	] as const;
</script>

<div class="min-h-screen bg-gray-50 px-4 py-10">
	<div class="mx-auto w-full max-w-2xl">
		<header class="mb-8 flex flex-wrap items-baseline justify-between gap-3">
			<a href={resolve('/')} class="text-lg font-bold tracking-tight text-gray-900">ontoplano</a>
			<nav class="flex gap-4 text-sm">
				{#each pages as item (item.path)}
					<a
						href={resolve(item.path)}
						class={page.url.pathname === item.path
							? 'font-semibold text-gray-900'
							: 'text-gray-500 hover:text-gray-900'}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</header>

		<article class="legal border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
			{@render children()}
		</article>
	</div>
</div>
