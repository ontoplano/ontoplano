<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { NAV_PLACES } from '$lib/sections-nav';
	import { routeGlyph } from '$lib/glyphs';
	import { page } from '$app/state';
	import RoomVerb from '$lib/components/RoomVerb.svelte';
	import { phoneWidth } from '$lib/breakpoints.svelte';
	import type { IconName } from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import { setRoomTitle } from '$lib/page-title.svelte';

	const t = useT();

	/**
	 * A room's name, its tabs, and the way back — in one place for every room.
	 *
	 * On a phone this is the app's header: it stays at the top while the room
	 * scrolls under it, so the name of where you are and the way between its
	 * tabs are always there. That is what a native app does and what a web page
	 * usually does not, and the difference is most of why one feels like an
	 * app.
	 *
	 * The glyph beside the name is the room's own — the same one the bottom
	 * bar draws for it — and it is not a button. It was a house that went
	 * home, which is a second way to do what the bar underneath already does
	 * with a bigger target, in the corner where a phone puts a back arrow.
	 * What a header is for is saying where you are, so it is part of the
	 * heading, at every width.
	 *
	 * Four rooms drew this markup themselves and had already drifted — Tasks
	 * hid its own name on a phone, the others did not.
	 */
	let {
		title,
		glyph: given,
		back,
		backLabel = 'Back',
		verbInTabs = false,
		still = false,
		fold = true,
		actions,
		children
	}: {
		title: string;
		/**
		 * The room's glyph, where the path does not already say it — Settings
		 * seen from /admin, whose own glyph is Administration's.
		 */
		glyph?: IconName;
		/**
		 * Where the way back goes, for a page inside a room rather than a room.
		 *
		 * An album, a notebook, one recipe: the name in the bar is the thing's,
		 * not the room's, and there has to be a way up to the list it came from.
		 * It takes the glyph's place, because the glyph says which room this is
		 * and an arrow pointing at that room says it too.
		 */
		back?: string;
		/** What the way back is called, for a screen reader. */
		backLabel?: string;
		/**
		 * What sits beside the name — a room's own buttons.
		 *
		 * On one line at every width: on a phone they fold behind a single
		 * "more" button, so a room with three of them does not wrap its bar to
		 * two rows and push the title up.
		 */
		actions?: import('svelte').Snippet;
		/**
		 * Whether the actions fold behind "more" on a phone. A room whose
		 * actions are already one glyph each there — the dashboard's corner —
		 * keeps them out.
		 */
		fold?: boolean;
		/** The room's tab strip, when it has one. */
		children?: import('svelte').Snippet;
		/**
		 * Whether the room draws its own verb at the end of its tab strip.
		 *
		 * A room with tabs does — see `TabbedRoom`, where the verb sits with the
		 * places it applies to. Without this it would be drawn twice.
		 */
		verbInTabs?: boolean;
		/**
		 * A bar drawn for a room that has not arrived yet — see `PendingPage`.
		 * It names nothing for the browser tab and draws no verb, because the
		 * screen that would answer either is still the one being left.
		 */
		still?: boolean;
	} = $props();

	/**
	 * The room's own glyph, found the way the bar below finds it: by path.
	 *
	 * Places that are not rooms of the bar — home, search, settings — have
	 * theirs in `$lib/glyphs`, so every title starts on the same column.
	 */
	const glyph = $derived(
		given ??
			NAV_PLACES.filter((place) =>
				page.url.pathname.startsWith(
					place.href.split('/')[1] ? `/${place.href.split('/')[1]}` : place.href
				)
			).at(0)?.icon ??
			routeGlyph(`/${page.url.pathname.split('/')[1] ?? ''}`)
	);

	const phone = phoneWidth();

	/* The browser tab says the room's name the way the bar does. */
	// Decided once: a bar is drawn still or not for the whole of its life.
	// svelte-ignore state_referenced_locally
	if (!still) setRoomTitle(() => title);

	/** The folded actions' menu, and where it opens: under its button. */
	let more = $state<HTMLElement>();
	let moreAt = $state({ top: 0, right: 0 });

	function placeMore(event: Event) {
		const button = event.currentTarget as HTMLElement;
		const box = button.getBoundingClientRect();
		moreAt = { top: box.bottom + 4, right: window.innerWidth - box.right };
	}

	/** Pressing one of the folded actions puts the menu away. */
	function foldAway() {
		try {
			more?.hidePopover?.();
		} catch {
			/* already closed */
		}
	}
</script>

<div class="room-bar">
	<div class="room-bar-head flex flex-nowrap items-center gap-2 pb-2 sm:pb-0">
		<h1 class="flex min-w-0 items-center gap-2 text-lg font-bold text-gray-900">
			<!--
				The glyph, or the way back in its place — the same column either
				way, so the name starts at one x on every screen.
			-->
			{#if back}
				<!-- Already resolved: `back` is whatever the page passed, and the page
				     built it with resolve(). -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={back} class="icon-btn room-bar-back" aria-label={backLabel}>
					<Icon name="undo" />
				</a>
			{:else}
				<span class="room-bar-glyph text-gray-500" aria-hidden="true" data-room-glyph>
					{#if glyph}<Icon name={glyph} size={20} />{/if}
				</span>
			{/if}
			<span class="truncate">{title}</span>
		</h1>
		<!--
			The screen's one verb, in the corner every screen keeps it in.

			`RoomVerb` draws it; this is only where it goes. A room with tabs
			puts it at the end of its tab strip instead and says so with
			`verbInTabs`, so the verb and the places it applies to read as one
			object rather than two rows of loose controls.
		-->
		<div class="ml-auto flex shrink-0 items-center gap-2">
			{#if !verbInTabs && !still}<RoomVerb />{/if}
			{#if actions}
				{#if phone.current && fold}
					<button
						type="button"
						class="icon-btn"
						popovertarget="room-bar-more"
						onclick={placeMore}
						title={t('ui.more')}
						aria-label={t('ui.more')}
					>
						<Icon name="more" />
					</button>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						bind:this={more}
						id="room-bar-more"
						popover="auto"
						class="room-bar-more overlay-face shadow-overlay"
						style="top: {moreAt.top}px; right: {moreAt.right}px"
						onclick={foldAway}
					>
						{@render actions()}
					</div>
				{:else}
					<div class="flex flex-nowrap items-center gap-2">{@render actions()}</div>
				{/if}
			{/if}
		</div>
	</div>
	{@render children?.()}
</div>

<style>
	/*
	 * The same height on every screen, action or no action.
	 *
	 * The bar grew when a screen had a primary verb and shrank when it did
	 * not — so sliding from Activities to Review moved the tab strip and
	 * everything under it. The row reserves the button's height always;
	 * Review simply leaves it empty.
	 */
	/*
	 * The glyph's column is kept even where there is no glyph, and the way
	 * back takes it over at the same width: a 36px target whose extra reach
	 * hangs into the gap either side rather than pushing the name along.
	 */
	.room-bar-glyph {
		display: inline-flex;
		flex: none;
		width: 1.25rem;
	}

	.room-bar-back {
		margin-inline: -0.5rem;
	}

	/*
	 * The folded actions: a column of the same buttons, under the button that
	 * opened it. A popover, so it opens over the page rather than inside the
	 * bar and moves nothing.
	 */
	.room-bar-more {
		position: fixed;
		inset: auto;
		margin: 0;
		flex-direction: column;
		align-items: stretch;
		gap: 0.25rem;
		padding: 0.25rem;
		border-width: 1px;
	}

	.room-bar-more:popover-open {
		display: flex;
	}

	/* Rows of the menu, on the overlay's own face, as a picker's list is. */
	.room-bar-more :global(.btn) {
		justify-content: flex-start;
		border-color: transparent;
		background-color: transparent;
		box-shadow: none;
		color: inherit;
	}

	.room-bar-more :global(.btn:hover) {
		background-color: rgb(255 255 255 / 0.12);
	}

	.room-bar-more :global(.btn > span) {
		display: inline;
	}

	.room-bar-head {
		/* The action's own height, so a screen without one is not shorter.
		   Measured rather than guessed: `.btn.btn-sm` is 2.25rem, and on a
		   phone this row adds the half-rem of padding under it. */
		min-height: 2.25rem;
	}

	@media (max-width: 639px) {
		.room-bar-head .icon-btn {
			color: var(--color-chrome-muted);
		}

		.room-bar-head {
			min-height: 3.25rem;
			/*
			 * Its own margins on a phone, where the page has none.
			 *
			 * The room's body and the tab track below run to both screen edges
			 * there; the name and the verb are words and a button and want air
			 * around them like everything else that is read.
			 */
			padding-inline: 1rem;
		}
	}
</style>
