<script lang="ts">
	import Icon, { type IconName } from '$lib/components/Icon.svelte';

	/**
	 * A flower of small choices, opened above the thumb.
	 *
	 * The wheel is for the eight rooms — a whole screen of it, because that is
	 * a place you go. This is for the small things that are not places: your
	 * account in the middle, and around it a tour of this screen, telling the
	 * operator something is wrong, the documentation, and paying for any of it.
	 * On the phone they used to be a square `?` parked in the corner of every
	 * screen, on top of whatever was under it.
	 *
	 * It works the way the wheel does, because it is the same hand: press the
	 * button and the flower flies up *above* the finger, so the finger is not
	 * covering it and nothing is under it to choose by accident. From there,
	 * either drag onto one and let go, or lift and tap. The press that opened
	 * it never chooses anything.
	 *
	 * The first item is the middle — the account, which is also the button that
	 * opens this, drawn bigger because it is the one most people came for. The
	 * rest are the petals, and they sit in a quarter turn of arc above it
	 * rather than in a ring around it: the hand is below, so below is where
	 * nothing can be, and that empty half is the way out of the gesture. Drag
	 * up, think better of it, come back down, let go, nothing happens.
	 */
	export type Petal = { key: string; label: string; icon: IconName };

	let {
		items,
		open = false,
		/** Where the gesture began, in viewport coordinates. */
		origin = { x: 0, y: 0 },
		/** True while a finger or button is still down, so release selects. */
		dragging = false,
		onselect,
		onclose
	}: {
		items: Petal[];
		open?: boolean;
		origin?: { x: number; y: number };
		dragging?: boolean;
		onselect: (key: string) => void;
		onclose: () => void;
	} = $props();

	/**
	 * The shape of the flower, in pixels and degrees.
	 *
	 * `RADIUS` is the arc the petals sit on and `PETAL` how big each one is.
	 * `MIDDLE` is the disc they sit above, half again as big as a petal,
	 * because it is the account and that is what most people came for. `RISE`
	 * is how far the middle floats off the press — a thumb's width, no more: it
	 * is the button that was pressed, and it should still read as that button.
	 *
	 * `SPAN` is how much of the circle the petals are laid along — a quarter
	 * turn, above the middle rather than around it. It is not independent of
	 * the other two: `n` petals across `SPAN` sit
	 * `2 × RADIUS × sin(SPAN / 2(n - 1))` apart, which has to be more than
	 * `PETAL` or they overlap and the flower reads as a clump.
	 */
	const RADIUS = 100;
	const PETAL = 44;
	const MIDDLE = 68;
	const RISE = 64;
	const SPAN = 90;
	/** Clear of the screen's edges, and of anything notched into the top. */
	const MARGIN = 12;

	/**
	 * Where the name of the lit choice sits: above the arc.
	 *
	 * Under the middle is where the hand is, and on a phone that is the bar
	 * itself — the name was printed across it. Above the flower there is
	 * nothing but page.
	 */
	const LABEL_RISE = RADIUS + PETAL / 2 + 26;

	/** The middle, and the ones above it. */
	const heart = $derived(items[0]);
	const petals = $derived(items.slice(1));
	const STEP = $derived(petals.length > 1 ? SPAN / (petals.length - 1) : 0);

	/**
	 * How wide the screen is for something pinned to it.
	 *
	 * Not `innerWidth`: the page reserves a scrollbar gutter, and where a
	 * browser draws classic scrollbars — a laptop does, a phone does not — that
	 * gutter comes off the box a fixed element is laid out in. Measured against
	 * the document's own box, which is that box.
	 */
	function layoutWidth(): number {
		return document.documentElement.getBoundingClientRect().width;
	}

	/** Half of how wide the whole flower is, edge to edge. */
	const REACH_X = RADIUS * Math.sin((SPAN / 2) * (Math.PI / 180)) + PETAL / 2;

	/**
	 * Where the middle is drawn: just above the press, slid only as far as it
	 * must be.
	 *
	 * Close to the finger on purpose — it is the button that was pressed, flown
	 * up and grown. Its petals go above it rather than around it, so nothing
	 * sits beside the hand and nothing comes back down onto the bar.
	 *
	 * Sideways it moves off the press only by however much of the arc would
	 * otherwise hang past an edge, which on a phone it does: the button that
	 * opens this is the last one in the bar.
	 */
	const centre = $derived.by(() => {
		const up = origin.y - RISE;
		if (typeof window === 'undefined') return { x: origin.x, y: up };
		return {
			x: Math.min(Math.max(origin.x, REACH_X + MARGIN), layoutWidth() - REACH_X - MARGIN),
			y: Math.max(up, RADIUS + PETAL / 2 + MARGIN)
		};
	});

	/**
	 * The angle petal `i` sits at, in screen degrees.
	 *
	 * A quarter turn of arc centred on straight up — which is -90°, the way the
	 * screen measures angles. Fixed rather than turned to face the hand: a menu
	 * chosen by muscle memory needs its things in the same place every time,
	 * and up is the direction there is always room in.
	 */
	function angleOf(i: number): number {
		return -90 - SPAN / 2 + STEP * i;
	}

	/** Where petal `i` sits, relative to the middle of the flower. */
	function petalAt(i: number): { x: number; y: number } {
		const angle = (angleOf(i) * Math.PI) / 180;
		return { x: Math.cos(angle) * RADIUS, y: Math.sin(angle) * RADIUS };
	}

	/** How far out from the middle the flower still counts. */
	const REACH = RADIUS + PETAL;

	/** A press that never went anywhere is a tap, not a gesture. */
	const DRAG_THRESHOLD = 16;

	/**
	 * How long the flower takes to open, and how much later each petal does.
	 *
	 * Nothing is chosen while it is still flying: for those frames the petals
	 * are somewhere between the finger and where they will end up, and a
	 * pointer that has not moved would be sitting on whichever one swept past.
	 */
	const BLOOM_MS = 180;
	const STAGGER_MS = 24;

	let active = $state(-1);
	let travelled = $state(0);
	let held = $state(false);
	let blooming = $state(false);
	let swallowClick = $state(false);
	/** On screen, which is `open` plus the flight back down into the finger. */
	let shown = $state(false);
	let leaving = $state(false);
	/** The same fact, untracked, so the effect can guard on it without looping. */
	let mounted = false;

	/**
	 * Which choice a point falls on, or -1 for none.
	 *
	 * 0 is the middle, then the petals in order. Everything past the arc, and
	 * everything below the flower, is nobody's — which is what lets a gesture
	 * end in nothing: drag up, think better of it, come back down to the hand,
	 * let go.
	 */
	function indexAt(x: number, y: number): number {
		const dx = x - centre.x;
		const dy = y - centre.y;
		const away = Math.hypot(dx, dy);
		if (away <= MIDDLE / 2 + 6) return 0;
		if (away > REACH || petals.length === 0) return -1;

		const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
		if (STEP === 0) return Math.abs(degrees - angleOf(0)) <= SPAN ? 1 : -1;

		// Rounded rather than bounded, so each petal owns the wedge of screen it
		// points into and the two at the ends own a little past themselves — the
		// same reason the wheel's slices reach the edge. A whole step past the
		// arc is beside the flower or below it, where the hand is.
		const i = Math.round((degrees - angleOf(0)) / STEP);
		if (i < 0 || i > petals.length - 1) return -1;
		return Math.abs(degrees - angleOf(i)) > STEP ? -1 : i + 1;
	}

	function onmove(e: PointerEvent) {
		if (!open) return;
		travelled = Math.max(travelled, Math.hypot(e.clientX - origin.x, e.clientY - origin.y));
		if (!blooming) active = indexAt(e.clientX, e.clientY);
	}

	function onup(e: PointerEvent) {
		if (!open) return;

		if (held) {
			const moved = Math.max(travelled, Math.hypot(e.clientX - origin.x, e.clientY - origin.y));
			held = false;
			// A tap is not a gesture. The flower stays open and waits for a
			// second one, which is what somebody meeting it for the first time
			// will do.
			if (moved < DRAG_THRESHOLD) {
				active = -1;
				swallowClick = true;
				return;
			}
		}

		const chosen = indexAt(e.clientX, e.clientY);
		if (chosen >= 0) onselect(items[chosen].key);
		else onclose();
	}

	/**
	 * A finger that never got to let go.
	 *
	 * A long press on a touch screen can be taken over by the browser, and then
	 * `pointerup` never arrives — leaving the flower open with a petal lit and
	 * nothing happening on release.
	 */
	function oncancel() {
		if (!open) return;
		if (held && travelled < DRAG_THRESHOLD) {
			held = false;
			active = -1;
			swallowClick = true;
			return;
		}
		const chosen = active;
		held = false;
		if (chosen >= 0) onselect(items[chosen].key);
		else onclose();
	}

	function onkey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, items.length - 1);
			return;
		}
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			active = active <= 0 ? 0 : active - 1;
			return;
		}
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (active >= 0) onselect(items[active].key);
			else onclose();
		}
	}

	/** The tap that opened the flower is followed by a click; it chooses nothing. */
	function afterOpening(fn: () => void): void {
		if (swallowClick) {
			swallowClick = false;
			return;
		}
		fn();
	}

	$effect(() => {
		if (!open) {
			active = -1;
			travelled = 0;
			held = false;
			blooming = false;

			// Back down the way it came, into the press that opened it. A menu
			// that simply stopped being there left the eye wondering where it
			// went.
			if (!mounted) return;
			mounted = false;
			leaving = true;
			const gone = setTimeout(
				() => {
					shown = false;
					leaving = false;
				},
				BLOOM_MS + STAGGER_MS * Math.max(petals.length, 0)
			);
			return () => clearTimeout(gone);
		}
		mounted = true;
		shown = true;
		leaving = false;
		held = dragging;
		travelled = 0;
		active = -1;
		blooming = true;
		const until = setTimeout(
			() => (blooming = false),
			BLOOM_MS + STAGGER_MS * Math.max(petals.length, 0)
		);
		return () => clearTimeout(until);
	});
</script>

<svelte:window
	onpointermove={onmove}
	onpointerup={onup}
	onpointercancel={oncancel}
	onkeydown={onkey}
/>

{#if shown}
	<!-- Everything else stops taking presses while the flower is up. Dimmed only
	     faintly: this is a handful of small choices, not a room change. -->
	<div
		class="fan-scrim {leaving ? 'is-leaving' : ''}"
		role="presentation"
		onclick={() => afterOpening(onclose)}
		oncontextmenu={(e) => e.preventDefault()}
	></div>

	<div
		class="fan {leaving ? 'is-leaving' : ''}"
		style="left: {centre.x}px; top: {centre.y}px"
		role="menu"
		aria-label="Account and help"
		tabindex="-1"
	>
		{#each petals as item, i (item.key)}
			{@const at = petalAt(i)}
			<button
				type="button"
				role="menuitem"
				class="petal {active === i + 1 ? 'is-active' : ''}"
				style="--to-x: {at.x}px; --to-y: {at.y}px; --delay: {(i + 1) *
					STAGGER_MS}ms; --leave-delay: {(petals.length - i) *
					STAGGER_MS}ms; --bloom: {BLOOM_MS}ms; --size: {PETAL}px"
				onpointerenter={() => !blooming && (active = i + 1)}
				onclick={() => afterOpening(() => onselect(item.key))}
				aria-label={item.label}
			>
				<Icon name={item.icon} size={22} />
			</button>
		{/each}

		<!-- The middle. It is the button in the bar, flown up and grown: the
		     account is what most people press this for, and a ring of equals
		     with no centre is not a flower. -->
		<button
			type="button"
			role="menuitem"
			class="petal heart {active === 0 ? 'is-active' : ''}"
			style="--to-x: 0px; --to-y: 0px; --delay: 0ms; --leave-delay: 0ms; --bloom: {BLOOM_MS}ms; --size: {MIDDLE}px"
			onpointerenter={() => !blooming && (active = 0)}
			onclick={() => afterOpening(() => onselect(heart.key))}
			aria-label={heart.label}
		>
			<Icon name={heart.icon} size={30} />
		</button>

		<!-- What the lit one is. Centred on the screen rather than on the flower,
		     which sits over the last button in the bar — a name hung under its
		     middle ran off the right-hand edge, and onto the bar. -->
		<div
			class="fan-label"
			class:is-shown={active >= 0}
			style="top: {Math.max(centre.y - LABEL_RISE, MARGIN)}px"
			aria-live="polite"
		>
			<span>{active >= 0 ? items[active].label : ''}</span>
		</div>
	</div>
{/if}

<style>
	.fan-scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: color-mix(in oklab, var(--color-chrome) 34%, transparent);
		animation: fan-scrim 140ms ease-out both;
		touch-action: none;
	}

	@keyframes fan-scrim {
		from {
			opacity: 0;
		}
	}

	.fan {
		position: fixed;
		z-index: 91;
		width: 0;
		height: 0;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.petal {
		position: absolute;
		width: var(--size);
		height: var(--size);
		margin-left: calc(var(--size) / -2);
		margin-top: calc(var(--size) / -2);
		display: grid;
		place-items: center;
		border-radius: 999px;
		border: 1px solid var(--color-gray-200);
		background: var(--color-white, #fff);
		color: var(--color-gray-800);
		box-shadow: var(--shadow-overlay);
		/* Flying up out of the finger, each one a beat after the last. */
		animation: petal-arrives var(--bloom) cubic-bezier(0.16, 0.7, 0.22, 1.06) var(--delay) both;
		transition:
			transform 120ms ease-out,
			background-color 120ms ease-out,
			color 120ms ease-out;
	}

	/* The middle sits over the petals: they grow out from under it. */
	.heart {
		z-index: 1;
	}

	@keyframes petal-arrives {
		from {
			transform: translate(0, 0) scale(0.4);
			opacity: 0;
		}
		to {
			transform: translate(var(--to-x), var(--to-y)) scale(1);
			opacity: 1;
		}
	}

	/*
	 * Lit: bigger, inverted, and lifted.
	 *
	 * The flower is chosen without looking at it once it is known, so the only
	 * job of the highlight is to be unmistakable at the edge of vision while
	 * the finger is on the way — hence all three at once rather than a tint.
	 */
	.petal.is-active {
		transform: translate(var(--to-x), var(--to-y)) scale(1.18);
		background: var(--color-chrome);
		color: var(--color-chrome-ink);
		border-color: transparent;
	}

	.fan-label {
		position: fixed;
		left: 0;
		right: 0;
		text-align: center;
		white-space: nowrap;
		opacity: 0;
		transition: opacity 120ms ease-out;
		pointer-events: none;
	}

	.fan-label span {
		display: inline-block;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: var(--color-chrome);
		color: var(--color-chrome-ink);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.fan-label.is-shown {
		opacity: 1;
	}

	/*
	 * And the same flight backwards, on the way out.
	 *
	 * The stagger reverses with it — the petal that arrived last leaves first,
	 * and the middle goes home last of all. Nothing takes a press while it
	 * happens: the menu is already closed, this is how it leaves.
	 */
	.fan.is-leaving {
		pointer-events: none;
	}

	/* Its own name rather than `animation-direction: reverse`: a finished
	   animation does not restart when a property of it changes, so reversing
	   the arrival in place snapped to the far keyframe instead of playing. */
	.fan.is-leaving .petal {
		animation: petal-leaves var(--bloom) cubic-bezier(0.4, 0, 0.7, 0.2) var(--leave-delay) both;
	}

	@keyframes petal-leaves {
		from {
			transform: translate(var(--to-x), var(--to-y)) scale(1);
			opacity: 1;
		}
		to {
			transform: translate(0, 0) scale(0.4);
			opacity: 0;
		}
	}

	.fan.is-leaving .fan-label {
		opacity: 0;
	}

	.fan-scrim.is-leaving {
		animation: fan-scrim 140ms ease-in reverse both;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.petal {
			animation-duration: 1ms;
		}
		.fan-scrim {
			animation-duration: 1ms;
		}
	}
</style>
