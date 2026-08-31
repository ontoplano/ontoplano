<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	/**
	 * The one row of tabs for everything under Settings.
	 *
	 * It lives in a component rather than in `/settings/+layout.svelte` because
	 * Administration is one of these tabs but is not one of these routes: /admin
	 * has a layout of its own, and while it drew no tabs, going there was a
	 * one-way trip — the only way back to Account was the main menu.
	 */
	let {
		billable = false,
		canEditInstance = false,
		canAdminister = false
	}: { billable?: boolean; canEditInstance?: boolean; canAdminister?: boolean } = $props();

	// One idea, one place. The three pages used to be /config, /account and
	// /settings/integrations, which is why nobody could find anything.
	/**
	 * Bring the tab you are on into view.
	 *
	 * The row scrolls on a phone, and the active tab can be off the end of it:
	 * arriving at Administration showed a bar starting at Account with no sign
	 * of where you actually were.
	 *
	 * By hand rather than `scrollIntoView`, which scrolls every scrollable
	 * ancestor it needs to — including the page, which then sat a hundred pixels
	 * to the left with the header cut off. This moves one element.
	 */
	let nav = $state<HTMLElement>();
	$effect(() => {
		const tab = nav?.querySelector('[aria-current="page"]');
		if (!nav || !tab) return;
		const here = tab.getBoundingClientRect();
		const row = nav.getBoundingClientRect();
		nav.scrollLeft += here.left - row.left - (row.width - here.width) / 2;
	});

	const tabs = $derived([
		{ path: '/settings/account', label: 'Account' } as const,
		{ path: '/settings/preferences', label: 'Preferences' } as const,
		...(billable ? [{ path: '/settings/billing', label: 'Billing' } as const] : []),
		{ path: '/settings/integrations', label: 'Integrations' } as const,
		...(canEditInstance ? [{ path: '/settings/instance', label: 'Instance' } as const] : []),
		...(canAdminister ? [{ path: '/admin', label: 'Administration' } as const] : [])
	]);
</script>

<nav bind:this={nav} class="flex gap-1 overflow-x-auto border-b border-gray-200">
	{#each tabs as tab (tab.path)}
		{@const active = page.url.pathname === tab.path}
		<!--
			The mark under the current tab is the ink, not the section accent.

			It used to be `var(--section-accent)`, and everything under Settings
			falls back to the Home section, whose accent is a slate grey. Beside a
			bold near-white label on a dark background that read as a mistake — a
			marker greyed out, as though the tab you were on were the disabled one.
			The ink inverts with the theme, so it matches the label it underlines in
			both.
		-->
		<a
			href={resolve(tab.path)}
			aria-current={active ? 'page' : undefined}
			class="border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors {active
				? 'border-gray-900 font-semibold text-gray-900'
				: 'border-transparent text-gray-500 hover:text-gray-900'}"
		>
			{tab.label}
		</a>
	{/each}
</nav>
