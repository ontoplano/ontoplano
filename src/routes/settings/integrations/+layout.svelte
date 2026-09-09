<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { scrollHints } from '$lib/actions/scroll-hints';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * Assistants, and everything else that talks to this account.
	 *
	 * They were one page, which put the thing this app is unusual for — that
	 * your week, your todos and your notes are reachable by an assistant you
	 * run, without any of it leaving your machine — three cards below a
	 * calendar address. It is the only part of the page somebody would come
	 * here for on purpose, so it is the tab this section opens on, and the
	 * calendar address, the webhooks and the data streams are the other one.
	 */
	const tabs = [
		{ href: resolve('/settings/integrations'), label: 'AI' },
		{ href: resolve('/settings/integrations/connections'), label: 'Integrations' }
	];

	const isActive = (href: string) => page.url.pathname === href;
</script>

<div class="space-y-4">
	<!-- The scrolling row, as everywhere else: the labels keep their size and
	     the strip moves under them. -->
	<nav
		use:scrollHints
		class="scroll-hints flex gap-0 border-b border-gray-200 md:gap-1"
		aria-label="Integrations sections"
	>
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				aria-current={isActive(tab.href) ? 'page' : undefined}
				class="tab-link border-b-2 px-2 py-2 text-sm font-medium whitespace-nowrap transition sm:px-4 {isActive(
					tab.href
				)
					? 'border-gray-900 text-gray-900'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				{tab.label}
			</a>
		{/each}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>

	{@render children()}
</div>
