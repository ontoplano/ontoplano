<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { NAV_PLACES } from '$lib/sections-nav';
	import { page } from '$app/state';

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
		actions,
		children
	}: {
		title: string;
		/** What sits beside the name — a room's own buttons. */
		actions?: import('svelte').Snippet;
		/** The room's tab strip, when it has one. */
		children?: import('svelte').Snippet;
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
	<div class="flex flex-wrap items-center gap-2 pb-2 sm:pb-0">
		{#if glyph}
			<span class="shrink-0 text-gray-500 sm:hidden" aria-hidden="true">
				<Icon name={glyph} size={20} />
			</span>
		{/if}
		<h1 class="min-w-0 shrink-0 truncate text-lg font-bold text-gray-900">{title}</h1>
		{#if actions}
			<div class="ml-auto flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
	{@render children?.()}
</div>
