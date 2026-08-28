<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import SettingsTabs from '$lib/components/SettingsTabs.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();

	const onAccount = $derived(page.url.pathname !== '/admin');
</script>

<!--
	The same shell as /settings/*, because Administration is one of those tabs.
	It is a route of its own — the whole area is behind an admin check that has
	nothing to do with a person's own settings — but arriving here used to
	replace the tab bar with nothing, so the way back to Account was the main
	menu. Same tabs, same place, and the trip is no longer one-way.
-->
<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Settings</h1>

	<SettingsTabs
		billable={data.billable}
		canEditInstance={data.canEditInstance}
		canAdminister={data.canAdminister}
	/>

	<!--
		No heading on the list itself: the active tab already says Administration,
		and a page that names itself twice reads as two pages. One account's page
		is a level down, and that one needs saying — and needs a way back.
	-->
	{#if onAccount}
		<div class="flex items-center gap-3">
			<h2 class="text-base font-semibold text-gray-900">Administration</h2>
			<a href={resolve('/admin')} class="text-sm text-gray-500 hover:text-gray-900"
				>← all accounts</a
			>
		</div>
	{/if}

	{@render children()}
</div>
