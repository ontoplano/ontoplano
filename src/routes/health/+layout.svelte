<script lang="ts">
	import { page } from '$app/state';

	let { children, data }: { children: any; data: { streams: { slug: string; name: string }[] } } =
		$props();

	/**
	 * Habits, and then whatever this account measures.
	 *
	 * "Weight" was a hardcoded tab, which told every stranger the app had
	 * opinions about their body and was empty for almost all of them. Weight is
	 * one data stream that one producer pushes; it earns a tab by existing.
	 */
	const tabs = $derived([
		{ href: '/health/habits', label: 'Habits' },
		...data.streams.map((s) => ({ href: `/data/${s.slug}`, label: s.name }))
	]);

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Health</h1>
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
