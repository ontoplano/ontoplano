<script lang="ts">
	import { page } from '$app/state';

	let { children }: { children: any } = $props();

	const tabs = [
		{ href: '/health/habits', label: 'Habits' },
		{ href: '/health/weight', label: 'Weight' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Health</h1>
	</div>

	<div class="flex gap-1 border-b border-gray-200">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="px-4 py-2 text-sm font-medium transition {isActive(tab.href)
					? 'border-b-2 border-gray-900 text-gray-900'
					: 'text-gray-500 hover:text-gray-700'}"
			>
				{tab.label}
			</a>
		{/each}
	</div>

	{@render children()}
</div>
