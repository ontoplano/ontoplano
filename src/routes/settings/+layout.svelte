<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();

	// One idea, one place. The three pages used to be /config, /account and
	// /settings/integrations, which is why nobody could find anything.
	const tabs = $derived([
		{ path: '/settings/account', label: 'Account' } as const,
		{ path: '/settings/preferences', label: 'Preferences' } as const,
		{ path: '/settings/integrations', label: 'Integrations' } as const,
		...(data.canEditInstance ? [{ path: '/settings/instance', label: 'Instance' } as const] : [])
	]);
</script>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Settings</h1>

	<nav class="flex gap-1 overflow-x-auto border-b border-gray-200">
		{#each tabs as tab (tab.path)}
			{@const active = page.url.pathname === tab.path}
			<a
				href={resolve(tab.path)}
				class="border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors {active
					? 'font-semibold text-gray-900'
					: 'border-transparent text-gray-500 hover:text-gray-900'}"
				style={active ? 'border-color: var(--section-accent)' : ''}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
