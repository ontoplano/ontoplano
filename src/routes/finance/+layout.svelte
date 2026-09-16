<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: resolve('/finance/ledgers'), label: t('rooms.finance.tabs.ledgers') },
		// Bills had a room and nothing pointing at it, which is a room nobody
		// finds. Beside Ledgers, because a bill is money leaving on a date and
		// that is the same subject as the lines it will turn into.
		{ href: resolve('/finance/bills'), label: t('rooms.finance.tabs.bills') },
		{ href: resolve('/finance/rules'), label: t('rooms.finance.tabs.rules') },
		{ href: resolve('/finance/insights'), label: t('rooms.finance.tabs.insights') }
	];
</script>

<TabbedRoom title={t('rooms.finance.title')} {tabs} label={t('rooms.finance.sections')}>
	{@render children()}
</TabbedRoom>
