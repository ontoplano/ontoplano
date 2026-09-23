<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import { FINANCE_TABS } from '$lib/sections';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();

	// The list is `FINANCE_TABS`, which the wheel reads too.
	const tabs = $derived(
		FINANCE_TABS.map((tab) => ({
			href: resolve(tab.href as '/finance/ledgers'),
			label: t(tab.label)
		}))
	);
</script>

<TabbedRoom title={t('rooms.finance.title')} {tabs} label={t('rooms.finance.sections')}>
	{@render children()}
</TabbedRoom>
