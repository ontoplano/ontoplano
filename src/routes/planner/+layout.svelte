<script lang="ts">
	import { page } from '$app/state';

	let { children }: { children: any } = $props();

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
		{ href: '/planner/plan', label: 'Plan' },
		{ href: '/planner/board', label: 'Board' },
		{ href: '/planner/todo', label: 'Todo' },
		{ href: '/planner/activities', label: 'Activities' },
		{ href: '/planner/history', label: 'History' },
		{ href: '/planner/review', label: 'Review' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Weekly Planner</h1>
	</div>

	<div class="snap-strip gap-1 border-b border-gray-200 md:flex">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="px-2 py-2 text-sm font-medium whitespace-nowrap transition sm:px-4 {isActive(
					tab.href
				)
					? 'border-b-2 text-gray-900'
					: 'text-gray-500 hover:text-gray-700'}"
				style={isActive(tab.href) ? 'border-color: var(--section-accent)' : ''}
			>
				{tab.label}
			</a>
		{/each}
	</div>

	{@render children()}
</div>
