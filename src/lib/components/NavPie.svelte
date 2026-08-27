<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { palette } from '$lib/palette.svelte';
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
	let { onopenchange }: { onopenchange?: (open: boolean) => void } = $props();

	let open = $state(false);
	let dragging = $state(false);
	let origin = $state({ x: 0, y: 0 });
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
		// The bar, plus the footer row that hangs below the ring.
		return px('--mobile-nav-height') + px('--safe-bottom') + 60;
	}

	const wedges = ROOMS.map((r) => ({ key: r.key, label: r.label, icon: r.icon, color: r.color }));

	export function summon(e: PointerEvent) {
		// Take the gesture before the browser can. Without this a press-and-hold
		// on a phone becomes a text selection or a scroll, and the release that
		// should have chosen a wedge never reaches us.
		e.preventDefault();
		const button = e.currentTarget as Element | null;
		button?.setPointerCapture?.(e.pointerId);

		origin = { x: e.clientX, y: e.clientY };
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
	{dragging}
	bottomInset={inset}
	{footer}
	onselect={enter}
	onclose={() => (open = false)}
/>

<!--
	Not rooms, but they were on the menu the pie replaced and a thumb still has to
	reach them. Below the ring rather than in it: a wedge is somewhere you go, and
	signing out is not.
-->
{#snippet footer()}
	<button
		type="button"
		onclick={() => (palette.open = true)}
		class="flex items-center gap-2 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-card"
	>
		<Icon name="search" size={16} /> Search
	</button>
	<a
		href="/settings/account"
		class="flex items-center gap-2 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-card"
	>
		<Icon name="settings" size={16} /> Settings
	</a>
	<form method="post" action="/login?/signOut" use:enhance>
		<button
			type="submit"
			class="flex items-center gap-2 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-card"
			title="Sign out"
			aria-label="Sign out"
		>
			<Icon name="sign-out" size={16} />
		</button>
	</form>
{/snippet}
