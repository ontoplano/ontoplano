<script lang="ts">
	/**
	 * The screen somebody asked for, before its contents have arrived.
	 *
	 * A press on a tab or a room used to leave the old screen standing until
	 * the new one's data had loaded — a second, on a phone, of the app looking
	 * as though it had not heard. This is drawn over the old screen as soon as
	 * the navigation starts, with the loading word for a screen reader.
	 *
	 * Between a room's own tabs the room's header stays where it is and this
	 * covers only the body. Going to another room, it draws that room's header
	 * itself — its bar, its glyph, its tabs, the one being gone to current —
	 * because none of that needs anybody's data, and a header that is a
	 * different shape while loading is a header that jumps when it arrives.
	 * Only the body is the shape of a list.
	 *
	 * Drawn over rather than instead of, and only after a beat (the delay is in
	 * the CSS, `.pending-page`): a navigation quicker than the eye never shows
	 * it, and nothing under it is moved or hidden, so a navigation that is
	 * abandoned leaves the screen exactly as it was. The shell gives up on it
	 * with the progress bar, so it cannot outstay a navigation that never ends.
	 */
	import type { IconName } from '$lib/components/Icon.svelte';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import TabStrip from '$lib/components/TabStrip.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		room
	}: {
		/**
		 * The room being gone to, when it is another room: its name, its glyph,
		 * and its tabs with the one being gone to marked. No tabs is a screen
		 * that has none — home.
		 */
		room?: {
			title: string;
			glyph?: IconName;
			tabs: { href: string; label: string; icon?: IconName }[];
			current: number;
		};
	} = $props();

	/** The shape of a list: one entry per row, each a little shorter than the last. */
	const ROWS = [70, 61, 52, 64, 46];
</script>

{#snippet bones()}
	{#each ROWS as width, i (i)}
		<div class="flex items-center gap-4 border-b border-gray-200 px-4 py-3 last:border-b-0">
			<span class="pending-bone size-7 shrink-0"></span>
			<span class="flex min-w-0 flex-1 flex-col gap-2">
				<span class="pending-bone h-3" style="width: {width}%"></span>
				<span class="pending-bone h-2 w-1/4"></span>
			</span>
		</div>
	{/each}
{/snippet}

<div
	class="pending-page {room ? 'pending-room' : ''}"
	role="status"
	aria-label={t('home.loading')}
	aria-busy="true"
>
	{#if room}
		<div class="room-frame" inert>
			<RoomBar title={room.title} glyph={room.glyph} still>
				{#if room.tabs.length > 0}
					<TabStrip tabs={room.tabs} current={room.current} label={room.title} />
				{/if}
			</RoomBar>
			<div class="room-body">{@render bones()}</div>
		</div>
	{:else}
		<div class="border border-gray-200 bg-white shadow-card">{@render bones()}</div>
	{/if}
</div>
