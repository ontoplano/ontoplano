<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { settingsTabs } from '$lib/settings-tabs';
	import { glyphFor } from '$lib/glyphs';
	import { useT } from '$lib/i18n';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();

	const t = useT();
	const onAccount = $derived(page.url.pathname !== '/admin');
</script>

<!--
	The same shell as /settings/*, because Administration is one of those tabs.
	It is a route of its own — the whole area is behind an admin check that has
	nothing to do with a person's own settings — but arriving here used to
	replace the tab bar with nothing, so the way back to Account was the main
	menu. Same tabs, same place, and the trip is no longer one-way.
-->
<TabbedRoom
	title={t('rooms.settings.title')}
	glyph={glyphFor('/settings')}
	tabs={settingsTabs(t, data)}
	label={t('rooms.settings.sections')}
>
	<!--
		No heading: the active tab already says Administration, and one
		account's page names the account in its own first band. What a level
		down needs is the way back, drawn the way the import page's is.
	-->
	{#if onAccount}
		<div class="mb-4">
			<a href={resolve('/admin')} class="btn btn-sm btn-quiet">
				<Icon name="arrow-left" />
				{t('admin.backToAccounts')}
			</a>
		</div>
	{/if}

	{@render children()}
</TabbedRoom>
