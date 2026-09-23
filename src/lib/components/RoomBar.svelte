<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { NAV_PLACES } from '$lib/sections-nav';
	import { page } from '$app/state';
	import RoomVerb from '$lib/components/RoomVerb.svelte';

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
	 * What a header is for is saying where you are. It is a phone
	 * affordance only: on a wide screen the navigation bar is already on the
	 * page and a second way home would be noise.
	 *
	 * Four rooms drew this markup themselves and had already drifted — Tasks
	 * hid its own name on a phone, the others did not.
	 */
	let {
		title,
		back,
		backLabel = 'Back',
		verbInTabs = false,
		actions,
		children
	}: {
		title: string;
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
		/** What sits beside the name — a room's own buttons. */
		actions?: import('svelte').Snippet;
		/** The room's tab strip, when it has one. */
		children?: import('svelte').Snippet;
		/**
		 * Whether the room draws its own verb at the end of its tab strip.
		 *
		 * A room with tabs does — see `TabbedRoom`, where the verb sits with the
		 * places it applies to. Without this it would be drawn twice.
		 */
		verbInTabs?: boolean;
	} = $props();

	/** The room's own glyph, found the way the bar below finds it: by path. */
	const glyph = $derived(
		NAV_PLACES.filter((place) =>
			page.url.pathname.startsWith(
				place.href.split('/')[1] ? `/${place.href.split('/')[1]}` : place.href
			)
		).at(0)?.icon
	);
</script>

<div class="room-bar">
	<div class="room-bar-head flex flex-wrap items-center gap-2 pb-2 sm:pb-0">
		{#if back}
			<!-- Already resolved: `back` is whatever the page passed, and the page
			     built it with resolve(). -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={back} class="icon-btn shrink-0" aria-label={backLabel}>
				<Icon name="undo" />
			</a>
		{:else if glyph}
			<span class="shrink-0 text-gray-500 sm:hidden" aria-hidden="true">
				<Icon name={glyph} size={20} />
			</span>
		{/if}
		<h1 class="min-w-0 shrink-0 truncate text-lg font-bold text-gray-900">{title}</h1>
		<!--
			The screen's one verb, in the corner every screen keeps it in.

			`RoomVerb` draws it; this is only where it goes. A room with tabs
			puts it at the end of its tab strip instead and says so with
			`verbInTabs`, so the verb and the places it applies to read as one
			object rather than two rows of loose controls.
		-->
		{#if !verbInTabs}
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<RoomVerb />
			</div>
		{/if}
		{#if actions}
			<div class="ml-auto flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
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
	.room-bar-head {
		/* The action's own height, so a screen without one is not shorter.
		   Measured rather than guessed: `.btn.btn-sm` is 2.25rem, and on a
		   phone this row adds the half-rem of padding under it. */
		min-height: 2.25rem;
	}

	@media (max-width: 639px) {
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
