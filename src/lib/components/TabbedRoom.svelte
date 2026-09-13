<script lang="ts">
	import { afterNavigate, goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import { scrollHints } from '$lib/actions/scroll-hints';
	import { swipeTabs } from '$lib/actions/swipe-tabs';
	import { TAB_SLIDE_EASING, TAB_SLIDE_MS, TAB_SLIDE_TRAVEL } from '$lib/tab-slide';

	/**
	 * A room with tabs: the strip, and the movement between them.
	 *
	 * Five rooms drew this markup themselves and had already drifted. Now they
	 * describe their tabs and this draws them — which is also what lets a swipe
	 * and a slide exist at all, since neither is worth writing five times.
	 *
	 * The movement is the only transition in the app. See `$lib/tab-slide`.
	 */
	let {
		title,
		tabs,
		label,
		dataTour,
		actions,
		children
	}: {
		title: string;
		/** In the order they are shown, which is the order a swipe walks. */
		tabs: { href: string; label: string }[];
		/** What the strip is called, for a screen reader. */
		label: string;
		/** What a guided tour calls this strip, where one points at it. */
		dataTour?: string;
		actions?: import('svelte').Snippet;
		children: import('svelte').Snippet;
	} = $props();

	/**
	 * Which tab a path is under. One of them, never two.
	 *
	 * The address itself when a tab has it, and otherwise the tab whose path
	 * the address continues — an open notebook is at `/notebooks/42`, which is
	 * not a tab, and belongs under Notebooks. The longest such tab wins, so a
	 * room whose first tab is the room's own root does not claim every page
	 * under it: `/notebooks/ideas` is Ideas, not Notebooks and Ideas both,
	 * which is what two underlines in the strip were saying.
	 */
	function tabFor(pathname: string): number {
		const exact = tabs.findIndex((tab) => tab.href === pathname);
		if (exact >= 0) return exact;

		let best = -1;
		for (let i = 0; i < tabs.length; i++)
			if (
				pathname.startsWith(`${tabs[i].href}/`) &&
				(best < 0 || tabs[i].href.length > tabs[best].href.length)
			)
				best = i;
		return best;
	}

	const at = $derived(tabFor(page.url.pathname));
	const here = (index: number) => index === at;

	let pane = $state<HTMLElement>();
	let frame = $state<HTMLElement>();
	/** Where the copy of the outgoing screen is put. Svelte never fills it. */
	let stage = $state<HTMLElement>();

	/** Which way the last tab change went: 1 rightwards, -1 leftwards, 0 not one. */
	let went = 0;

	/** Neither the strip nor the movement belongs on a screen with a mouse. */
	const onAPhone = () =>
		typeof window !== 'undefined' &&
		window.matchMedia('(pointer: coarse)').matches &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function step(by: number) {
		const to = tabs[at + by];
		if (at < 0 || !to) return;
		// Already a `resolve()` result: every room builds its tabs with one, and
		// the rule cannot see through the array to know that.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(to.href);
	}

	/*
	 * The screen that is leaving, kept for as long as it takes to leave.
	 *
	 * SvelteKit swaps the content the moment the new page is ready, so by the
	 * time anything could animate the old screen it is already gone. A copy of
	 * it is laid over the frame instead and slid out from there, which is what
	 * makes this two panes passing rather than one pane arriving.
	 *
	 * Nothing is returned from `onNavigate`: SvelteKit holds a navigation until
	 * whatever it gets back settles, and holding one on a decoration is how a
	 * burst of them — six presses of Next in the onboarding wizard — left the
	 * app unable to move at all. Twice.
	 */
	onNavigate((navigation) => {
		const from = tabFor(navigation.from?.url.pathname ?? '');
		const to = tabFor(navigation.to?.url.pathname ?? '');
		went = from < 0 || to < 0 || from === to ? 0 : Math.sign(to - from);
		if (!went || !pane || !stage || !onAPhone()) return;

		const leaving = pane.cloneNode(true) as HTMLElement;
		leaving.setAttribute('aria-hidden', 'true');
		leaving.style.cssText = `position:absolute;inset:0;pointer-events:none;width:${pane.offsetWidth}px`;
		/*
		 * Into a container Svelte renders and never puts anything in, rather
		 * than beside the pane: the runtime places its own nodes by their
		 * neighbours, and an element it did not create sitting among them is
		 * how that goes wrong. Here there are no neighbours to confuse.
		 */
		// eslint-disable-next-line svelte/no-dom-manipulating
		stage.append(leaving);
		leaving
			.animate(
				[
					{ transform: 'translateX(0)', opacity: 1 },
					{ transform: `translateX(${-went * TAB_SLIDE_TRAVEL * 100}%)`, opacity: 0 }
				],
				{ duration: TAB_SLIDE_MS, easing: TAB_SLIDE_EASING, fill: 'forwards' }
			)
			.addEventListener('finish', () => leaving.remove());
	});

	afterNavigate(() => {
		if (!went || !pane || !onAPhone()) return;
		pane.animate(
			[
				{ transform: `translateX(${went * TAB_SLIDE_TRAVEL * 100}%)`, opacity: 0 },
				{ transform: 'translateX(0)', opacity: 1 }
			],
			{ duration: TAB_SLIDE_MS, easing: TAB_SLIDE_EASING }
		);
		went = 0;
	});
</script>

<div class="space-y-4">
	<RoomBar {title} {actions}>
		<nav
			use:scrollHints
			class="scroll-hints flex gap-0 border-b border-gray-200 md:gap-1"
			aria-label={label}
			data-tour={dataTour}
		>
			<!-- Resolved by whoever described the tabs: a stream's slug is a route
			     parameter, and the rule cannot see through the array. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			{#each tabs as tab, index (tab.href)}
				<a
					href={tab.href}
					aria-current={here(index) ? 'page' : undefined}
					class="tab-link border-b-2 px-2 py-2 text-sm font-medium whitespace-nowrap transition sm:px-4 {here(
						index
					)
						? 'border-gray-900 text-gray-900'
						: 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					{tab.label}
				</a>
			{/each}
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	</RoomBar>

	<!-- `.tab-frame` is where the slide is clipped, and why it gives the page
	     gutter back first. -->
	<div
		bind:this={frame}
		class="tab-frame"
		use:swipeTabs={{ next: () => step(1), back: () => step(-1) }}
	>
		<div bind:this={pane}>{@render children()}</div>
		<div bind:this={stage} aria-hidden="true"></div>
	</div>
</div>
