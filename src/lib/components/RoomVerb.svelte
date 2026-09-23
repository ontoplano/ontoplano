<script lang="ts">
	/**
	 * The screen's one verb — New task, New notebook — wherever the room puts it.
	 *
	 * Declared by the page through `$lib/room-action` rather than passed down,
	 * because the page that knows what the verb is sits three components below
	 * the bar — and there is one of these drawn per screen, which is what stops
	 * it wandering.
	 *
	 * Quiet rather than filled: it stands in the room's own chrome, and a solid
	 * block of ink up there shouts over the name beside it.
	 *
	 * It was written out inside `RoomBar`, which is why it could only ever be on
	 * the title line. A room with tabs puts it at the end of the tab strip
	 * instead, so the verb and the places it applies to are one object rather
	 * than two rows of loose controls.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { roomAction } from '$lib/room-action.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	const room = $derived(roomAction());
</script>

{#if room}
	<div class="flex shrink-0 items-center gap-2">
		{#if room.href}
			<!-- Resolved by the page that declared it. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={room.href} class="btn btn-sm" data-tour={room.tour || undefined}>
				<Icon name="plus" />
				{room.label}
			</a>
		{:else}
			<button
				type="button"
				class="btn btn-sm"
				onclick={room.run}
				data-tour={room.tour || undefined}
			>
				{#if !room.open}<Icon name="plus" />{/if}
				{room.open ? t('ui.cancel') : room.label}
				{#if room.kbd && !room.open}
					<!-- The chip reads against the button it sits on: the quiet `.btn`,
					     not the filled one it used to ride. Grey-100 on grey-600 flips
					     with the ramp, so it is legible in both themes rather than one. -->
					<kbd
						class="hidden border border-gray-300 bg-gray-100 px-1 text-xs text-gray-600 sm:inline"
						>{room.kbd}</kbd
					>
				{/if}
			</button>
		{/if}
	</div>
{/if}
