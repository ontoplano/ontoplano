<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { scrollHints } from '$lib/actions/scroll-hints';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * The plan comes first: it is what the section is for. Then today's version
	 * of it, then what has no day yet, then the vocabulary, then what happened.
	 *
	 * Track is gone: it was the same occurrences the board already shows, listed
	 * instead of arranged, and everything it could do to one of them the board's
	 * card editor now does.
	 *
	 * Review comes after History for the same reason: History is the record and
	 * Review is what you do with it.
	 */
	const tabs = [
		{ href: resolve('/planner/plan'), label: 'Plan' },
		{ href: resolve('/planner/board'), label: 'Board' },
		{ href: resolve('/planner/todo'), label: 'Todo' },
		{ href: resolve('/planner/activities'), label: 'Activities' },
		{ href: resolve('/planner/history'), label: 'History' },
		{ href: resolve('/planner/review'), label: 'Review' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="space-y-4">
	<!--
		The heading is for a wide screen only.

		On a phone it was the first of six stacked rows above the grid, saying what
		the highlighted item in the bottom bar and the tab row directly beneath it
		both already said. The tabs are the header there; the space goes to the
		plan, which is what somebody opened this to look at.
	-->
	<div class="hidden flex-wrap items-center justify-between gap-3 sm:flex">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Weekly Planner</h1>
	</div>

	<!--
		Full size, and it scrolls when it has to.

		Shrinking the type until six tabs fit was the wrong trade: the row fit and
		became hard to read. The tabs stay legible, the row scrolls, and the
		chevron at the edge says so — which is what makes a hidden tab findable.
	-->
	<div use:scrollHints class="scroll-hints flex gap-0 border-b border-gray-200 md:gap-1">
		<!--
			These are resolved where the tabs are written, above. The rule looks at
			the href expression and cannot see through the array, so it is turned
			off for the loop rather than for the file.
		-->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		{#each tabs as tab (tab.href)}
			<!--
				The mark is the ink, as in Settings: one tab row treatment, and a
				section accent under a bold label read as a stray blue blob.

				`rounded-none` because the playful style rounds every corner by
				default, and a bottom-only border on a rounded box draws a smile
				rather than an underline.
			-->
			<a
				href={tab.href}
				class="tab-link border-b-2 px-2 py-2 text-sm font-medium whitespace-nowrap transition sm:px-4 {isActive(
					tab.href
				)
					? 'border-gray-900 text-gray-900'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				{tab.label}
			</a>
		{/each}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>

	{@render children()}
</div>
