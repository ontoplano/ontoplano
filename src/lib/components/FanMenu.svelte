<script lang="ts">
	import Icon, { type IconName } from '$lib/components/Icon.svelte';

	/**
	 * A handful of choices, fanned above the thumb.
	 *
	 * The wheel is for the eight rooms — a whole screen of it, because that is
	 * a place you go. This is for the five small things that are not places:
	 * your account, a tour of this screen, telling the operator something is
	 * wrong, the documentation, and paying for any of it. On the phone they
	 * used to be a square `?` parked in the corner of every screen, on top of
	 * whatever was under it.
	 *
	 * It works the way the wheel does, because it is the same hand: press the
	 * button and the arc flies up *above* the finger, so the finger is not
	 * covering it and nothing is under it to choose by accident. From there,
	 * either drag onto a petal and let go, or lift and tap one. The press that
	 * opened it never chooses anything.
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
	 * The shape of the fan, in pixels and degrees.
	 *
	 * `RADIUS` is how far the petals sit from the centre of the arc and
	 * `PETAL` how big each one is, so the whole thing is `2 × RADIUS + PETAL`
	 * across — a little over two hundred, which fits the narrowest phone with
	 * room on both sides. `RISE` is how far above the finger the arc's centre
	 * sits: enough that the hand is below the whole fan rather than in it.
	 *
	 * `SPAN` is how much of the circle the petals are laid along, centred on
	 * straight up — which is -90°, the way the screen measures angles.
	 *
	 * The two of them are not independent: five petals along `SPAN` sit
	 * `2 × RADIUS × sin(SPAN / 8)` apart, and at 112° over a radius of 92 that
	 * was 44px between the middles of circles 52px across — they overlapped,
	 * and the fan read as a clump rather than as five directions. These leave
	 * a finger's width of air between neighbours.
	 */
	const RADIUS = 96;
	const PETAL = 48;
	const RISE = 112;
	const SPAN = 150;
	/** Clear of the screen's edges, and of anything notched into the top. */
	const MARGIN = 12;

	/**
	 * How far below its own horizontal the arc may be turned.
	 *
	 * The turn below is what keeps the fan on the screen, and left to itself it
	 * would keep turning until the first petal was down beside the hand again —
	 * on the bar, under the thumb, which is the one place a menu may not be.
	 */
	const DIP = 8;

	/** How far under the arc's middle the name of the lit petal sits. */
	const LABEL_DROP = PETAL / 2 + 24;

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

	/** The angle petal `i` sits at, in screen degrees, before the arc is turned. */
	const FROM = -90 - SPAN / 2;
	const STEP = $derived(items.length > 1 ? SPAN / (items.length - 1) : 0);

	/**
	 * How far round the arc turns to stay on the screen.
	 *
	 * The button that opens this is the last one in the phone's bar, so the
	 * press is always near the right-hand edge and an arc drawn square above it
	 * would put two petals past it. Turning it — opening up and to the left,
	 * where a right thumb has room anyway — keeps it over the finger that
	 * opened it, which sliding the whole fan along would not.
	 *
	 * Bounded by `DIP`, because a turn far enough to fit a fan beside the
	 * screen's edge is a turn that brings the first petal back down to the bar.
	 * What the turn cannot buy, `centre` pays for by sliding.
	 */
	const tilt = $derived.by(() => {
		if (typeof window === 'undefined') return 0;
		const reach = PETAL / 2 + MARGIN;
		const right = (layoutWidth() - reach - origin.x) / RADIUS;
		if (right >= 1) return 0;
		const wanted = -(Math.acos(Math.min(Math.max(right, -1), 1)) * 180) / Math.PI - (FROM + SPAN);
		return Math.max(Math.min(wanted, 0), -180 - DIP - FROM);
	});

	/** The angle petal `i` sits at, in screen degrees. */
	function angleOf(i: number): number {
		return FROM + STEP * i + tilt;
	}

	/** Where petal `i` sits, relative to the centre of the arc. */
	function petalAt(i: number): { x: number; y: number } {
		const angle = (angleOf(i) * Math.PI) / 180;
		return { x: Math.cos(angle) * RADIUS, y: Math.sin(angle) * RADIUS };
	}

	/**
	 * Where the arc is drawn: above the press, slid only as far as it must be.
	 *
	 * The fan belongs to the finger that opened it, so this starts directly
	 * above the press and moves off it only by however much of the arc is still
	 * hanging past an edge once it has turned as far as it is allowed to.
	 */
	const centre = $derived.by(() => {
		const up = origin.y - RISE;
		if (typeof window === 'undefined') return { x: origin.x, y: up };

		const spread = items.map((_, i) => petalAt(i));
		const left = Math.min(...spread.map((p) => p.x)) - PETAL / 2;
		const right = Math.max(...spread.map((p) => p.x)) + PETAL / 2;
		const top = Math.min(...spread.map((p) => p.y)) - PETAL / 2;
		const width = layoutWidth();

		return {
			x: Math.min(Math.max(origin.x, MARGIN - left), width - MARGIN - right),
			y: Math.max(up, MARGIN - top)
		};
	});

	/**
	 * How far from the centre a point has to be to mean a petal.
	 *
	 * Nearer than this is the fan's own dead middle: drag up, think better of
	 * it, come back down, let go, nothing happens — the same escape the
	 * wheel's hole gives. It is also where the finger is when the fan opens,
	 * which is why the opening press cannot choose.
	 */
	const DEAD_ZONE = RADIUS * 0.45;

	/** A press that never went anywhere is a tap, not a gesture. */
	const DRAG_THRESHOLD = 16;

	/**
	 * How long the fan takes to arrive, and how much later each petal does.
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
	 * Which petal a point falls on, or -1 for none.
	 *
	 * By angle rather than by distance, so the target is the whole wedge of
	 * screen a petal points into and not the circle drawn on it — the same
	 * reason the wheel's slices reach the edge. Anything below the arc's
	 * horizontal, or inside the dead zone, is nobody's.
	 */
	function petalIndexAt(x: number, y: number): number {
		const dx = x - centre.x;
		const dy = y - centre.y;
		if (Math.hypot(dx, dy) < DEAD_ZONE) return -1;

		let degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
		// atan2 gives -180…180, and the arc can be turned past the first of
		// those — so bring the angle onto the same side of the circle the fan
		// is drawn on before comparing.
		if (degrees > 90) degrees -= 360;
		// Past either end of the arc by more than one whole step is nobody's:
		// that is beside the fan or below it, where the hand is.
		if (degrees > angleOf(items.length - 1) + STEP) return -1;
		if (degrees < angleOf(0) - STEP) return -1;

		// Rounded rather than bounded, so each petal owns the whole wedge of
		// screen it points into and the two at the ends own everything past
		// them — the same reason the wheel's slices reach the edge.
		const i = STEP === 0 ? 0 : Math.round((degrees - angleOf(0)) / STEP);
		return Math.min(Math.max(i, 0), items.length - 1);
	}

	function onmove(e: PointerEvent) {
		if (!open) return;
		travelled = Math.max(travelled, Math.hypot(e.clientX - origin.x, e.clientY - origin.y));
		if (!blooming) active = petalIndexAt(e.clientX, e.clientY);
	}

	function onup(e: PointerEvent) {
		if (!open) return;

		if (held) {
			const moved = Math.max(travelled, Math.hypot(e.clientX - origin.x, e.clientY - origin.y));
			held = false;
			// A tap is not a gesture. The fan stays open and waits for a second
			// one, which is what somebody meeting it for the first time will do.
			if (moved < DRAG_THRESHOLD) {
				active = -1;
				swallowClick = true;
				return;
			}
		}

		const chosen = petalIndexAt(e.clientX, e.clientY);
		if (chosen >= 0) onselect(items[chosen].key);
		else onclose();
	}

	/**
	 * A finger that never got to let go.
	 *
	 * A long press on a touch screen can be taken over by the browser, and
	 * then `pointerup` never arrives — leaving the fan open with a petal lit
	 * and nothing happening on release.
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

	/** The tap that opened the fan is followed by a click; it chooses nothing. */
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

			// Back down the way they came, into the press that fanned them out.
			// A menu that simply stopped being there left the eye wondering
			// where it went.
			if (!mounted) return;
			mounted = false;
			leaving = true;
			const gone = setTimeout(
				() => {
					shown = false;
					leaving = false;
				},
				BLOOM_MS + STAGGER_MS * Math.max(items.length - 1, 0)
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
			BLOOM_MS + STAGGER_MS * Math.max(items.length - 1, 0)
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
	<!-- Everything else stops taking presses while the fan is up. Dimmed only
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
		aria-label="Help and account"
		tabindex="-1"
	>
		{#each items as item, i (item.key)}
			{@const at = petalAt(i)}
			<button
				type="button"
				role="menuitem"
				class="petal {active === i ? 'is-active' : ''}"
				style="--to-x: {at.x}px; --to-y: {at.y}px; --delay: {i *
					STAGGER_MS}ms; --leave-delay: {(items.length - 1 - i) *
					STAGGER_MS}ms; --bloom: {BLOOM_MS}ms; --size: {PETAL}px"
				onpointerenter={() => !blooming && (active = i)}
				onclick={() => afterOpening(() => onselect(item.key))}
				aria-label={item.label}
			>
				<Icon name={item.icon} size={22} />
			</button>
		{/each}

		<!-- What the lit petal is. It sits below the arc, where the hand is not,
		     and says nothing at all until something is lit. -->
		<div
			class="fan-label"
			class:is-shown={active >= 0}
			style="top: {centre.y + LABEL_DROP}px"
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
	 * The fan is chosen without looking at it once it is known, so the only
	 * job of the highlight is to be unmistakable at the edge of vision while
	 * the finger is on the way — hence all three at once rather than a tint.
	 */
	.petal.is-active {
		transform: translate(var(--to-x), var(--to-y)) scale(1.18);
		background: var(--color-chrome);
		color: var(--color-chrome-ink);
		border-color: transparent;
	}

	/*
	 * Centred on the screen rather than on the fan.
	 *
	 * The fan sits over the last button in the bar, so a name hung under its
	 * middle ran off the right-hand edge — "Tell the operat". The arc is where
	 * the choosing happens; the word only has to be readable.
	 */
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
	 * The stagger reverses with it — the petal that arrived last leaves first —
	 * so the fan closes the way a hand of cards does. Nothing takes a press
	 * while it happens: the menu is already closed, this is how it leaves.
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
