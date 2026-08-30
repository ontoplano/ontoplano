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
	let {
		onopenchange,
		hidden = []
	}: { onopenchange?: (open: boolean) => void; hidden?: readonly string[] } = $props();

	/**
	 * Which preference toggle closes each room. Diary is the room's own page —
	 * People and Notebooks keep their navbar tabs even when it is away, so
	 * only the door this pie opens decides.
	 */
	const ROOM_HIDE: Record<string, string> = {
		goals: 'goals',
		diary: 'diary',
		ideas: 'ideas',
		health: 'health',
		shopping: 'shopping',
		kitchen: 'recipes'
	};

	let open = $state(false);
	let dragging = $state(false);
	let origin = $state({ x: 0, y: 0 });
	let anchor = $state<{ x: number; y: number } | null>(null);
	let inset = $state(0);

	/**
	 * How much of the bottom belongs to the navigation bar.
	 *
	 * On a phone the gesture starts at the very bottom of the screen, so the pie
	 * always needs pushing up — and it has a footer down there of its own.
	 */
	function bottomInset(): number {
		if (typeof window === 'undefined') return 0;
		if (window.innerWidth >= 1024) return 0;
		const style = getComputedStyle(document.documentElement);
		const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
		return px('--mobile-nav-height') + px('--safe-bottom') + 16;
	}

	/**
	 * On the phone the pie does not open under the thumb.
	 *
	 * Its trigger is the raised button in the middle of the bar, so the pie
	 * belongs on that axis — centred, and lifted clear of the hand that opened
	 * it. Opening under the finger put half the rooms behind the thumb and the
	 * bottom ones behind the bar, which is the one thing a menu must not do.
	 */
	function phoneOrigin(): { x: number; y: number } | null {
		if (typeof window === 'undefined' || window.innerWidth >= 1024) return null;
		const style = getComputedStyle(document.documentElement);
		const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
		const bar = px('--mobile-nav-height') + px('--safe-bottom');
		// The ring's outer edge plus a thumb's width above the bar.
		return { x: window.innerWidth / 2, y: window.innerHeight - bar - 200 };
	}

	// No Home wedge: the navbar and the phone bar both carry Home as a plain
	// button, and a pie slot spent on "go to the start" is a slot a real room
	// could have used.
	const wedges = $derived(
		ROOMS.filter((r) => r.key !== 'home' && !hidden.includes(ROOM_HIDE[r.key] ?? '')).map((r) => ({
			key: r.key,
			label: r.label,
			icon: r.icon,
			color: r.color
		}))
	);

	export function summon(e: PointerEvent) {
		// Take the gesture before the browser can. Without this a press-and-hold
		// on a phone becomes a text selection or a scroll, and the release that
		// should have chosen a wedge never reaches us.
		e.preventDefault();
		const button = e.currentTarget as Element | null;
		button?.setPointerCapture?.(e.pointerId);

		// The finger, for telling a tap from a drag…
		origin = { x: e.clientX, y: e.clientY };
		// …and, on a phone, where the ring is actually drawn.
		anchor = phoneOrigin();
		dragging = e.pointerType !== 'mouse' || e.button === 0;
		inset = bottomInset();
		open = true;
	}

	$effect(() => onopenchange?.(open));

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
	{anchor}
	{dragging}
	bottomInset={inset}
	onselect={enter}
	onclose={() => (open = false)}
/>
