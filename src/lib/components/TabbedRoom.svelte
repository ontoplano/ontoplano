<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import { scrollHints } from '$lib/actions/scroll-hints';
	import { onSwipe } from '$lib/swipe';
	import { swipeSurface } from '$lib/swipe-surface';
	import {
		holdHeight,
		releaseHeight,
		slideAway,
		slideOn,
		slidesHere,
		stopHiding
	} from '$lib/slide';

	/**
	 * A room with tabs: the strip, and the movement between them.
	 *
	 * Five rooms drew this markup themselves and had already drifted. Now they
	 * describe their tabs and this draws them — which is also what lets a swipe
	 * and a slide exist at all, since neither is worth writing five times.
	 *
	 * The movement is in `$lib/slide`, shared with the movement between rooms.
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

	/** The panel that moves. Its content is `body`, which is what is replaced. */
	let pane = $state<HTMLElement>();
	let body = $state<HTMLElement>();
	/** Kept as tall as what left, so nothing below walks up the page. */
	let frame = $state<HTMLElement>();
	/** Where the copy of the outgoing screen is put. Svelte never fills it. */
	let stage = $state<HTMLElement>();

	/** Which way the last tab change went: 1 rightwards, -1 leftwards, 0 not one. */
	let went = 0;

	function step(by: number) {
		const to = tabs[at + by];
		if (at < 0 || !to) return;
		// Already a `resolve()` result: every room builds its tabs with one, and
		// the rule cannot see through the array to know that.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(to.href);
	}

	/*
	 * The swipe is listened for on the whole screen, not on this box.
	 *
	 * A room's content is as tall as its content; below it is page, and a
	 * swipe there is still a swipe. Listening on the shell's scroller is what
	 * makes "anywhere, at any height" true — which is what a phone app does
	 * and what listening on the content only ever half did.
	 */
	const surface = swipeSurface();
	$effect(() => {
		const on = surface?.();
		if (!on) return;
		return onSwipe(on, { next: () => step(1), back: () => step(-1) });
	});

	/*
	 * `beforeNavigate`, and it has to be: `onNavigate` runs *after* the load.
	 *
	 * Read SvelteKit's `navigate()` and the order is plain — it awaits
	 * `load_route(intent)` and only then calls the `onNavigate` callbacks. So
	 * a movement started there begins the instant the data lands, which is the
	 * exact thing this is supposed to fix: press a tab on a slow connection,
	 * watch the bar fill, and the screen moves once it is already over.
	 * `beforeNavigate` runs when the press happens, before anything is asked
	 * for.
	 *
	 * Nothing is returned from either hook: SvelteKit holds a navigation until
	 * whatever it gets back settles, and holding one on a decoration is how a
	 * burst of them — six presses of Next in the onboarding wizard — left the
	 * app unable to move at all. Twice.
	 */
	beforeNavigate((navigation) => {
		const from = tabFor(navigation.from?.url.pathname ?? '');
		const to = tabFor(navigation.to?.url.pathname ?? '');
		went = from < 0 || to < 0 || from === to ? 0 : Math.sign(to - from);
		// `willUnload` is a navigation that leaves the app: the browser takes
		// the page away itself, and hiding the screen for it only means staring
		// at nothing while it goes.
		if (!navigation.to || navigation.willUnload) went = 0;
		if (!went || !pane || !body || !stage || !slidesHere()) return;

		/*
		 * Both halves at the press, rather than one at the press and one when
		 * the data lands.
		 *
		 * The movement used to be: take the old screen off, wait for the next
		 * one to load, bring it on. So the arrival was the load — press a tab on
		 * a slow connection and the screen leaves, nothing happens, and then
		 * something slides in. What an app does is move when you ask it to and
		 * then wait, which is this: the content leaves, the empty panel arrives
		 * behind it, and if the data is not there by the time it settles the
		 * mark turns in the middle of a panel that has already stopped moving.
		 */
		holdHeight(frame, body);
		slideAway(stage, body, went);
		slideOn(pane, went);
	});

	afterNavigate(() => {
		// In place: the panel arrived while the data was loading, so the content
		// appears where it already is rather than sliding in a second time.
		stopHiding(body);
		releaseHeight(frame);
		went = 0;
	});

	/*
	 * Nothing may leave the screen hidden.
	 *
	 * A screen goes out of sight while its copy travels, and it is `slideOn`
	 * that brings it back — which never runs for a navigation that is abandoned
	 * or superseded. So the moment nothing is navigating, whatever is here is
	 * on view, whether a movement finished or not.
	 */
	$effect(() => {
		if (!navigating.to) {
			stopHiding(body);
			releaseHeight(frame);
		}
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

	<!-- `.slide-frame` is where the movement is clipped, and why it gives the
	     page gutter back first. -->
	<div bind:this={frame} class="slide-frame">
		<div bind:this={pane}>
			<div bind:this={body}>{@render children()}</div>
		</div>
		<div bind:this={stage} class="slide-stage" aria-hidden="true"></div>
		<!--
			No mark of its own: the shell already turns one behind whatever has
			left, and this frame sits inside that one. Two would be two marks
			turning at different heights for one wait.
		-->
	</div>
</div>
