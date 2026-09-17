<script lang="ts">
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	const t = useT();

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
	export type Petal = {
		key: string;
		label: PlainKey;
		icon: IconName;
		/**
		 * How many things behind this petal are waiting, or 0 for none.
		 *
		 * The bar's own button wears a plain dot when anything at all is
		 * waiting — there is no room out there for a number, and "something
		 * happened" is all a bar has to say. The count belongs here, on the
		 * petal that leads to it, which is the first place with room for it.
		 */
		waiting?: number;
	};

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
	 * `SPAN` is how much of the circle the petals are laid along, and `TILT` is
	 * where the middle of that arc points. Laid symmetrically above the account
	 * — `TILT` of straight up — the four petals came out as a row across the
	 * top, which reads as a toolbar that happens to be curved. Pointed up and
	 * to the left instead, they read as what they are: a fan opening away from
	 * the thumb, on the diagonal a thumb actually travels.
	 *
	 * `SPAN` is not independent of the other two: `n` petals across `SPAN` sit
	 * `2 × RADIUS × sin(SPAN / 2(n - 1))` apart, which has to be more than
	 * `PETAL` or they overlap and the flower reads as a clump.
	 *
	 * Which is why `SPAN` is no longer a number at all. It was 84°, and at
	 * `RADIUS` 100 that put four petals 48px apart when a petal is 44px across
	 * — four pixels of air, which reads as one scalloped blob rather than four
	 * things and gives a finger no room to be wrong in. Worse, it was *fixed*:
	 * hiding a section drops a petal and the rest drifted apart, adding one
	 * squeezed them further, so how crowded the flower looked depended on
	 * something nobody was thinking about when they set the angle.
	 *
	 * So the gap is the constant and the arc is worked out from it. With the
	 * numbers above that is about 90° for four petals and 122° for five, and
	 * the flower still clears the screen because `centre` clamps it.
	 */
	const RADIUS = 118;
	const PETAL = 44;
	const MIDDLE = 68;
	const RISE = 64;
	/** Air between two neighbouring petals, which is the thing worth fixing. */
	const PETAL_GAP = 18;
	/** However wide the arc has to get, it stops short of a half-circle. */
	const WIDEST_SPAN = 150;

	/**
	 * And then the whole flower, shifted off the button it grew from.
	 *
	 * `RISE` is how far the middle flies up from the press, and it was the only
	 * thing moving it — so the fan sat squarely over the thumb that opened it,
	 * which is the one place a hand cannot see. These move it up and to the
	 * left of that, into the part of the screen a right thumb is not covering.
	 *
	 * In CSS pixels, from what they are on a phone: this screen is about five
	 * of them to the millimetre, so these are around half a centimetre up and a
	 * third of one left. They are a nudge to the whole thing — the petals, the
	 * labels and the middle move together, because they are all placed from
	 * this one point.
	 *
	 * Smaller than they were, because the arc grew: a wider flower already
	 * reaches further from the thumb than a narrow one shifted away from it,
	 * and the two together pushed it into the top edge.
	 */
	const SHIFT_UP = 28;
	const SHIFT_LEFT = 16;
	/** Up and to the left: −90° is straight up, −180° is level to the left. */
	const TILT = -135;
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
	/**
	 * How far apart the petals sit, and therefore how wide the arc is.
	 *
	 * Two petals `STEP` apart on a circle of `RADIUS` are
	 * `2 × RADIUS × sin(STEP / 2)` apart on the screen; this is that read
	 * backwards, from the distance we want to the angle that gives it.
	 */
	const STEP = $derived.by(() => {
		if (petals.length < 2) return 0;
		const wanted = (PETAL + PETAL_GAP) / (2 * RADIUS);
		const step = (Math.asin(Math.min(1, wanted)) * 360) / Math.PI;
		return Math.min(step, WIDEST_SPAN / (petals.length - 1));
	});
	const SPAN = $derived(STEP * (petals.length - 1));

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

	/**
	 * How far the flower reaches either side of its middle.
	 *
	 * Not the same both ways any more. Tilted up and to the left, every petal
	 * is to the left of the account: it needs a petal's worth of room that
	 * side and almost none on the other, so a symmetric figure would hold the
	 * middle further from the right edge than it has any reason to be — and
	 * the account button belongs near the thumb that pressed it.
	 *
	 * Measured off the angles rather than assumed, so changing `TILT` or
	 * `SPAN` cannot leave the clamp describing the old shape.
	 */
	const reach = $derived.by(() => {
		const xs = petals.map((_, i) => RADIUS * Math.cos((angleOf(i) * Math.PI) / 180));
		const ys = petals.map((_, i) => RADIUS * Math.sin((angleOf(i) * Math.PI) / 180));
		const half = PETAL / 2;
		return {
			left: Math.max(MIDDLE / 2, -Math.min(0, ...xs) + half),
			right: Math.max(MIDDLE / 2, Math.max(0, ...xs) + half),
			top: Math.max(MIDDLE / 2, -Math.min(0, ...ys) + half)
		};
	});

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
		const up = origin.y - RISE - SHIFT_UP;
		const across = origin.x - SHIFT_LEFT;
		if (typeof window === 'undefined') return { x: across, y: up };
		return {
			// Still kept inside the screen: the shift moves where it would like
			// to be, and these two decide where it can be.
			x: Math.min(Math.max(across, reach.left + MARGIN), layoutWidth() - reach.right - MARGIN),
			y: Math.max(up, reach.top + MARGIN)
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
		return TILT - SPAN / 2 + STEP * i;
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
	 * The short way round, for a difference between two angles.
	 *
	 * `atan2` answers in (-180°, 180°], and the first petal sits at -177° — so
	 * the lower half of its wedge is at -191°, which comes back as +169°. The
	 * difference from the petal it is sitting on then reads as 355° instead of
	 * -5°, that petal is decided to be twelve steps away, and the whole bottom
	 * half of it does nothing. On a phone that is a petal you can only light by
	 * putting your finger almost on its neighbour, which is what it looked
	 * like: the bell only answered along its top edge.
	 *
	 * Every comparison between a pointer's angle and a petal's goes through
	 * this. There is no case where the long way round is the right answer.
	 */
	const turn = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

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
		if (STEP === 0) return Math.abs(turn(degrees - angleOf(0))) <= SPAN ? 1 : -1;

		// Rounded rather than bounded, so each petal owns the wedge of screen it
		// points into and the two at the ends own a little past themselves — the
		// same reason the wheel's slices reach the edge. A whole step past the
		// arc is beside the flower or below it, where the hand is.
		const i = Math.round(turn(degrees - angleOf(0)) / STEP);
		if (i < 0 || i > petals.length - 1) return -1;
		return Math.abs(turn(degrees - angleOf(i))) > STEP ? -1 : i + 1;
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
		aria-label={t('fan.accountAndHelp')}
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
				aria-label={t(item.label)}
			>
				<Icon name={item.icon} size={22} />
				{#if item.waiting}
					<span class="petal-count" data-waiting={item.waiting}>
						{item.waiting > 99 ? '99+' : item.waiting}
					</span>
				{/if}
			</button>
		{/each}

		<!-- The middle. It is the button in the bar, flown up and grown: the
		     account is what most people press this for, and a ring of equals
		     with no centre is not a flower. -->
		<button
			type="button"
			role="menuitem"
			class="petal heart {active === 0 ? 'is-active' : ''}"
			style="--to-x: 0px; --to-y: 0px; --home-x: {origin.x - centre.x}px; --home-y: {origin.y -
				centre.y}px; --delay: 0ms; --leave-delay: 0ms; --bloom: {BLOOM_MS}ms; --size: {MIDDLE}px"
			onpointerenter={() => !blooming && (active = 0)}
			onclick={() => afterOpening(() => onselect(heart.key))}
			aria-label={t(heart.label)}
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
			<span>{active >= 0 ? t(items[active].label) : ''}</span>
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

	/*
	 * How many things are waiting behind a petal.
	 *
	 * On the petal rather than on the bar's button, which wears a plain dot:
	 * out there a number would be smaller than the thing it is counting, and
	 * "something happened" is all a bar needs to say. This is the first place
	 * with room to say how much.
	 */
	.petal-count {
		position: absolute;
		top: -0.25rem;
		right: -0.25rem;
		display: grid;
		place-items: center;
		min-width: 1.15rem;
		padding-inline: 0.25rem;
		border-radius: 999px;
		background: var(--color-red-600, #dc2626);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 600;
		line-height: 1.15rem;
		font-variant-numeric: tabular-nums;
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

	/*
	 * The middle goes back to the button, not to the middle of the flower.
	 *
	 * The flower floats a thumb's width above the press, so collapsing to its
	 * own centre left the account hanging in the air over the bar — and the
	 * real button reappearing underneath read as the thing dropping the last
	 * inch by itself. `--home` is where the button actually is, measured from
	 * the flower's centre.
	 */
	.fan.is-leaving .heart {
		animation: heart-goes-home var(--bloom) cubic-bezier(0.4, 0, 0.7, 0.2) both;
	}

	@keyframes heart-goes-home {
		from {
			transform: translate(0, 0) scale(1);
			opacity: 1;
		}
		to {
			transform: translate(var(--home-x), var(--home-y)) scale(0.45);
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
