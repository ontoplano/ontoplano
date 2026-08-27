<script lang="ts">
	import { goto } from '$app/navigation';
	import { ROOMS, roomFor } from '$lib/sections-nav';
	import RadialMenu from '$lib/components/RadialMenu.svelte';

	/**
	 * The eight rooms, under the cursor.
	 *
	 * You already have two ways to move around: the bar, which tells you where
	 * you are, and ⌘K, which is faster than either once you know it exists. This
	 * is the third — the one for somebody on a mouse who does not want to read a
	 * list of ten words every time.
	 *
	 * Deliberately *alongside* the bar rather than instead of it. A navigation
	 * that is slower in week one and faster in week three is a bad trade if
	 * people leave in week one, and the honest way to find out is to use both for
	 * a fortnight and see which one goes untouched.
	 */
	let open = $state(false);
	let dragging = $state(false);
	let origin = $state({ x: 0, y: 0 });

	const wedges = ROOMS.map((r) => ({ key: r.key, label: r.label, icon: r.icon, color: r.color }));

	export function summon(e: PointerEvent) {
		origin = { x: e.clientX, y: e.clientY };
		dragging = e.pointerType !== 'mouse' || e.button === 0;
		open = true;
	}

	function enter(key: string) {
		open = false;
		const room = roomFor(key);
		// The destinations are a fixed list in `sections-nav.ts`, not user input.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		if (room) goto(room.href);
	}
</script>

<RadialMenu
	items={wedges}
	{open}
	{origin}
	{dragging}
	onselect={enter}
	onclose={() => (open = false)}
/>
