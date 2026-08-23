<script lang="ts">
	import { page } from '$app/state';

	let { children }: { children: any } = $props();

	const tabs = [
		{ href: '/planner/board', label: 'Board' },
		{ href: '/planner/track', label: 'Track' },
		{ href: '/planner/plan', label: 'Plan' },
		{ href: '/planner/todo', label: 'Todo' },
		{ href: '/planner/activities', label: 'Activities' },
		{ href: '/planner/history', label: 'History' }
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
				class="px-4 py-2 text-sm font-medium transition {isActive(tab.href)
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
