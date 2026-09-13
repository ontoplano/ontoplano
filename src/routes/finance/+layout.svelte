<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: resolve('/finance/ledgers'), label: 'Ledgers' },
		// Bills had a room and nothing pointing at it, which is a room nobody
		// finds. Beside Ledgers, because a bill is money leaving on a date and
		// that is the same subject as the lines it will turn into.
		{ href: resolve('/finance/bills'), label: 'Bills' },
		{ href: resolve('/finance/rules'), label: 'Rules' },
		{ href: resolve('/finance/insights'), label: 'Insights' }
	];
</script>

<TabbedRoom title="Finance" {tabs} label="Finance sections">
	{@render children()}
</TabbedRoom>
