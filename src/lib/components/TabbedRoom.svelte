<script lang="ts">
	import { setRoomTabs } from '$lib/room-tabs.svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import { scrollHints } from '$lib/actions/scroll-hints';
	import RoomVerb from '$lib/components/RoomVerb.svelte';
	import { phoneWidth } from '$lib/breakpoints.svelte';
	import { onSwipe } from '$lib/swipe';
	import { swipeSurface } from '$lib/swipe-surface';
	import {
		holdHeight,
		releaseHeight,
		landOn,
		slideAway,
		slideOn,
		slidesHere,
		stopHiding
	} from '$lib/slide';
	import { hintMarkSpin } from '$lib/mark-spin';

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
		belongsTo,
		dataTour,
		nested = false,
		actions,
		children
	}: {
		title: string;
		/** In the order they are shown, which is the order a swipe walks. */
		tabs: { href: string; label: string }[];
		/** What the strip is called, for a screen reader. */
		label: string;
		/**
		 * Which tab a page belongs to when its address says otherwise.
		 *
		 * A page can be part of a room and live somewhere else — a data
		 * stream is reached from Connections and answers at `/data/<slug>`.
		 * Without this the strip drew with nothing underlined and the page
		 * read as somewhere else entirely, which is what it looked like.
		 */
		belongsTo?: string;
		/** What a guided tour calls this strip, where one points at it. */
		dataTour?: string;
		/**
		 * Whether this room is inside another one.
		 *
		 * Then it draws only its tabs, at the top of the surface the outer room
		 * already put there — no bar, no title, no second body. Two of these
		 * stacked whole is two rooms on one screen.
		 */
		nested?: boolean;
		actions?: import('svelte').Snippet;
		children: import('svelte').Snippet;
	} = $props();

	/*
	 * The strip says what it is drawing, so `H` and `L` can walk the same list
	 * in the same order. See `$lib/room-tabs` — it was worked out from the
	 * menu before, which is a different list with a different order and holes
	 * in it where a room has no menu entries at all.
	 */
	$effect(() => {
		setRoomTabs(tabs);
		return () => setRoomTabs([]);
	});

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

	const at = $derived(tabFor(belongsTo ?? page.url.pathname));
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
	/** The empty panel's arrival, so landing can ask whether it is still going. */
	let arriving: Animation | null = null;

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
	/** Whether the verb has room at the end of the tab strip. */
	const phone = phoneWidth();

	const swipeTarget = swipeSurface();
	$effect(() => {
		const on = swipeTarget?.();
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
		// Zeroed when the movement is skipped — see the same guard in the root
		// layout: a direction left set here becomes a landing nothing asked for.
		if (!went || !pane || !body || !stage || !slidesHere()) {
			went = 0;
			return;
		}

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
		arriving = slideOn(pane, went);
		// The waiting medallion turns against the way the tabs are sweeping,
		// the same rule the rooms follow. The layout starts the spin; this is
		// the tab telling it which way things went.
		hintMarkSpin(-went);
	});

	afterNavigate(() => {
		// Joining the panel mid-flight when the load was quick, or arriving
		// again — with the content finally in it — when the load outlived the
		// slide. Never appearing in place: see `landOn`.
		landOn(pane, body, arriving, went);
		releaseHeight(frame);
		went = 0;
		arriving = null;
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

{#snippet strip()}
	<!--
		The tabs and the room's verb, on one line and on one ground.

			They were a row of underlined words with nothing behind them and the
			verb up on the title line a rule away, which reads as three loose
			things rather than as one strip. The tabs are the same control the
			markdown box uses now — a track with a tile that travels to the place
			you are on — and the verb stands at the far end of it.

			`sliding` measures whichever child carries `aria-current="page"`, the
			convention this strip already used, so nothing here had to learn how
			the tile works.
		-->
	<div class="room-tabs">
		<!--
				The track and the strip that scrolls inside it are two elements.

				The fade that says "there is more this way" is a mask, and a mask
				takes the background with it — so masking the track itself made
				its own surface dissolve at the end and showed the room's colour
				through, which reads as a smudge rather than as a row that
				continues. The track keeps its surface and its corner; the row of
				tabs inside it is the thing that fades.
			-->
		<div class="seg seg-track min-w-0">
			<nav use:scrollHints class="seg-scroll scroll-hints" aria-label={label} data-tour={dataTour}>
				<!-- Resolved by whoever described the tabs: a stream's slug is a
					     route parameter, and the rule cannot see through it. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				{#each tabs as tab, index (tab.href)}
					<a href={tab.href} aria-current={here(index) ? 'page' : undefined}>
						{tab.label}
					</a>
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</nav>
			<!--
					The verb stands on the same ground as the tabs.

					It was a sibling of the track, so it sat on the page behind with
					the track's surface stopping short of it — two objects on one
					line rather than one strip with a button at the end.

					On a phone it goes back up beside the room's name: there is no
					room for it here across 390px, where the tabs would have to give
					way and half of them would end up behind the fade.
				-->
			{#if !phone.current}<RoomVerb />{/if}
		</div>
	</div>
{/snippet}

<div class="room-frame {nested ? 'room-frame-nested' : ''}">
	{#if nested}
		<!--
			A second level of tabs inside a room that already has one.

			Settings → Integrations is two rooms deep, and drawing the whole of
			this twice gave it two bars, two titles and two bands of page ground
			— which reads as two rooms stacked rather than as one room with
			sections in it. Nested, only the strip is drawn, and it sits at the
			top of the surface the outer room already put there.
		-->
		{@render strip()}
	{:else}
		<RoomBar {title} {actions} verbInTabs={!phone.current}>
			{@render strip()}
		</RoomBar>
	{/if}

	<!-- `.slide-frame` is where the movement is clipped, and why it gives the
	     page gutter back first. -->
	<div bind:this={frame} class="slide-frame">
		<div bind:this={pane}>
			<!--
				Something solid under the tabs.

				The track is square along its bottom edge because it sits on the
				room rather than floating above it — and that only reads as right
				if there is a surface there to sit on. Without one the strip is a
				pill with two corners cut off for no reason, which is what Finance
				and Media and Health looked like.
			-->
			<div bind:this={body} class={nested ? '' : 'room-body'}>{@render children()}</div>
		</div>
		<div bind:this={stage} class="slide-stage" aria-hidden="true"></div>
		<!--
			No mark of its own: the shell already turns one behind whatever has
			left, and this frame sits inside that one. Two would be two marks
			turning at different heights for one wait.
		-->
	</div>
</div>
