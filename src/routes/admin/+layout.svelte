<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const onAccount = $derived(page.url.pathname !== '/admin');
</script>

<div class="space-y-4">
	<div class="flex items-center gap-3">
		<h1 class="text-lg font-bold text-gray-900">Administration</h1>
		{#if onAccount}
			<a href={resolve('/admin')} class="text-sm text-gray-500 hover:text-gray-900"
				>← all accounts</a
			>
		{/if}
	</div>

	{@render children()}
</div>
