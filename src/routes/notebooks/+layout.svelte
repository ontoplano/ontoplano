<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	/**
	 * Notebooks is one room with two shelves — the notebooks, and the diary.
	 *
	 * Notebooks is the general one, which is why it names the room and comes
	 * first: a diary is one notebook-shaped practice among the subjects you
	 * write against. People stays its own entry: it reads like a directory,
	 * not like writing.
	 */
	// The preference that hides the notebooks section hides its tab; the room
	// then opens on the diary.
	const tabs = $derived([
		...(data.hiddenSections.includes('notebooks')
			? []
			: [{ href: resolve('/notebooks'), label: 'Notebooks' }]),
		{ href: resolve('/notebooks/diary'), label: 'Diary' },
		{ href: resolve('/notebooks/people'), label: 'People' }
	]);

	/** People is one of these tabs now, so the strip shows on every page here. */
	const showTabs = true;

	function active(href: string): boolean {
		if (href === '/notebooks') {
			return (
				page.url.pathname === '/notebooks' ||
				(page.url.pathname.startsWith('/notebooks/') &&
					!page.url.pathname.startsWith('/notebooks/diary'))
			);
		}
		return page.url.pathname.startsWith(href);
	}
</script>

{#if showTabs}
	<div class="mb-4 space-y-3">
		<h1 class="text-lg font-bold text-gray-900">Notebooks</h1>
		<nav class="flex gap-1 border-b border-gray-200" aria-label="Notebooks sections">
			{#each tabs as tab (tab.href)}
				<!-- Already a resolve() result; the rule cannot see through the array,
				     and -next-line cannot reach an attribute two lines down. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={tab.href}
					aria-current={active(tab.href) ? 'page' : undefined}
					class="tab-link border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors {active(
						tab.href
					)
						? 'border-gray-900 font-semibold text-gray-900'
						: 'border-transparent text-gray-500 hover:text-gray-900'}"
				>
					{tab.label}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</nav>
	</div>
{/if}

{@render children()}
