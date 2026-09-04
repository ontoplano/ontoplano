<script lang="ts">
	import SettingsTabs from '$lib/components/SettingsTabs.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();
</script>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Settings</h1>

	<SettingsTabs
		billable={data.billable}
		family={data.family}
		canEditInstance={data.canEditInstance}
		canAdminister={data.canAdminister}
	/>

	{@render children()}
</div>
