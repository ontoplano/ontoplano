<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	/**
	 * Notes is one room with two shelves: the diary, and the notebooks.
	 *
	 * Notebooks had a navigation entry of its own for a while, which made the
	 * bar longer without making anything easier to find — both are places you
	 * write, and somebody looking for either thinks "notes" first. People stays
	 * its own entry: it reads like a directory, not like writing.
	 */
	// The preference that used to put the Notebooks nav entry away puts its
	// tab away instead — same switch, same meaning.
	const tabs = $derived([
		{ href: resolve('/diary'), label: 'Diary' },
		...(data.hiddenSections.includes('notebooks')
			? []
			: [{ href: resolve('/diary/notebooks'), label: 'Notebooks' }])
	]);

	/** People lives under /diary for its colour, not for these tabs. */
	const showTabs = $derived(!page.url.pathname.startsWith('/diary/people'));

	function active(href: string): boolean {
		if (href === '/diary') {
			return (
				page.url.pathname === '/diary' ||
				(page.url.pathname.startsWith('/diary/') &&
					!page.url.pathname.startsWith('/diary/notebooks'))
			);
		}
		return page.url.pathname.startsWith(href);
	}
</script>

{#if showTabs}
	<div class="mb-4 space-y-3">
		<h1 class="text-lg font-bold text-gray-900">Notes</h1>
		<nav class="flex gap-1 border-b border-gray-200" aria-label="Notes sections">
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
