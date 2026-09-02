<script lang="ts">
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { wedgeAt, wedgeCentre, wedgeEdges, wedgeStep } from '$lib/radial';

	/**
	 * A pie of choices, under the thumb.
	 *
	 * Radial menus beat lists up to about eight items, and only because of
	 * muscle memory: after a week you are not reading "Idea", you are flicking
	 * up-left to the purple one. Which means the two things that matter are that
	 * every wedge is a big target, and that a wedge is always in the same place.
	 *
	 * Three ways in, one menu. Click the trigger and the pie stays open, for
	 * somebody who has never seen it. Press and drag, release on a wedge, for
	 * the person who has — one motion, no click. Arrow keys and Enter for the
	 * keyboard, which is also the accessible path, because a pie is invisible to
	 * a screen reader.
	 *
	 * The hole in the middle is not a target. A gesture menu needs somewhere
	 * safe to let go: press, think better of it, release, nothing happens.
	 */
	export type Wedge = { key: string; label: string; icon: IconName; color: string };

	let {
		items,
		open = false,
		/** Where the gesture began, in viewport coordinates. */
		origin = { x: 0, y: 0 },
		/**
		 * Where to draw the ring, if not around the gesture.
		 *
		 * The phone's trigger is a fixed button at the bottom of the screen, so
		 * the pie is drawn above the hand instead of under it — but the gesture
		 * maths (was this a tap or a drag?) still measures from the finger.
		 */
		anchor = null,
		/** True while a finger or button is still down, so release selects. */
		dragging = false,
		/** Screen the pie must stay clear of — a fixed navigation bar, usually. */
		bottomInset = 0,
		onselect,
		onclose
	}: {
		items: Wedge[];
		open?: boolean;
		origin?: { x: number; y: number };
		anchor?: { x: number; y: number } | null;
		dragging?: boolean;
		bottomInset?: number;
		onselect: (key: string) => void;
		onclose: () => void;
	} = $props();

	// A tenth wider than it first shipped: at 132 the slices were tight enough
	// that a name and its glyph fought for the same band.
	const OUTER = 145;
	const INNER = 57;
	/** Room for the ring plus the shadow it casts. */
	const PAD = 13;

	let active = $state(-1);
	let centre = $state({ x: 0, y: 0 });
	let held = $state(false);

	/**
	 * The click that belongs to the press that opened this.
	 *
	 * A tap is pointerdown, pointerup, *then* a click — and by the time the click
	 * lands the pie is already open underneath the finger, so it hit the backdrop
	 * and shut again instantly. From the outside the menu simply refused to open.
	 * The first click after a tap-open belongs to that tap and is swallowed.
	 */
	let swallowClick = $state(false);

	/** How far the pointer has travelled since the gesture began. */
	let travelled = $state(0);

	/**
	 * The pie is placed where the gesture began, then pushed back on screen.
	 *
	 * A menu that opens half off the edge is a menu with three reachable wedges,
	 * and the trigger lives at the bottom of the screen precisely because that
	 * is where the thumb is — so it always needs pushing up.
	 */
	$effect(() => {
		if (!open) {
			active = -1;
			held = false;
			swallowClick = false;
			travelled = 0;
			return;
		}
		const margin = OUTER + PAD;
		const at = anchor ?? origin;
		centre = {
			x: Math.min(Math.max(at.x, margin), window.innerWidth - margin),
			y: Math.min(Math.max(at.y, margin), window.innerHeight - margin - bottomInset)
		};
		held = dragging;
		travelled = 0;
	});

	/**
	 * Which wedge a point falls in, or -1 for the hole.
	 *
	 * The arithmetic is in `$lib/radial.ts`, with the drawing below, so the hit
	 * test and the picture cannot disagree — which is a bug nobody sees, they
	 * only see a menu that chooses the wrong thing.
	 */
	function wedgeIndexAt(x: number, y: number): number {
		const dx = x - centre.x;
		const dy = y - centre.y;
		if (Math.hypot(dx, dy) < INNER) return -1;
		return wedgeAt(dx, dy, items.length);
	}

	function onmove(e: PointerEvent) {
		if (!open) return;
		travelled = Math.max(travelled, Math.hypot(e.clientX - origin.x, e.clientY - origin.y));
		active = wedgeIndexAt(e.clientX, e.clientY);
	}

	/** A press that never went anywhere is a tap, not a gesture. */
	const DRAG_THRESHOLD = 16;

	/**
	 * Every click the pie accepts has to survive this first.
	 *
	 * The tap that opens the menu is followed by a click, and by then the pie is
	 * already under the finger — so the click chose whichever wedge the trigger
	 * happened to sit inside, and a tap on the capture button silently wrote a
	 * note. The backdrop, the wedges and the hole all go through here.
	 */
	function afterOpening(fn: () => void): void {
		if (swallowClick) {
			swallowClick = false;
			return;
		}
		fn();
	}

	function onup(e: PointerEvent) {
		if (!open) return;

		if (held) {
			const moved = Math.max(travelled, Math.hypot(e.clientX - origin.x, e.clientY - origin.y));
			held = false;
			// A tap is not a gesture. Leave the pie open and wait for a click,
			// which is what somebody meeting it for the first time will do.
			if (moved < DRAG_THRESHOLD) {
				active = -1;
				swallowClick = true;
				return;
			}
		}

		const chosen = wedgeIndexAt(e.clientX, e.clientY);
		if (chosen >= 0) onselect(items[chosen].key);
		else onclose();
	}

	/**
	 * A finger that never got to let go.
	 *
	 * A long press on a touch screen makes the browser take the gesture over —
	 * text selection, the callout menu, a scroll — and when it does, `pointerup`
	 * never arrives. The pie was left open with a selection box drawn across a
	 * wedge and nothing happened on release, which is precisely what a menu must
	 * not do. `touch-action` and `user-select` below stop most of it; this
	 * finishes the gesture with whatever was under the finger when it was taken
	 * away, so a press that reached a wedge still counts.
	 */
	function oncancel() {
		if (!open) return;

		// A tap on a touch screen can end in a cancel rather than an up, and a tap
		// must not choose anything: the finger is still sitting on the trigger,
		// which is inside whichever wedge happens to be nearest it.
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
			active = (active + 1 + items.length) % items.length;
			return;
		}
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active <= 0 ? items.length : active) - 1;
			return;
		}
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (active >= 0) onselect(items[active].key);
			else onclose();
		}
	}

	/**
	 * One annulus sector, drawn from a centre at 0,0.
	 *
	 * Anti-clockwise from six o'clock, so the sweep flags are the opposite of
	 * what a clockwise ring uses: 0 on the outer arc, 1 on the inner one coming
	 * back. See `$lib/radial.ts` for which way round and why.
	 */
	function wedgePath(i: number): string {
		const { from, to } = wedgeEdges(i, items.length);
		const big = wedgeStep(items.length) > Math.PI ? 1 : 0;
		const at = (r: number, a: number) =>
			`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;

		return [
			`M ${at(INNER, from)}`,
			`L ${at(OUTER, from)}`,
			`A ${OUTER} ${OUTER} 0 ${big} 0 ${at(OUTER, to)}`,
			`L ${at(INNER, to)}`,
			`A ${INNER} ${INNER} 0 ${big} 1 ${at(INNER, from)}`,
			'Z'
		].join(' ');
	}

	/** Where a wedge's label sits: upright, never rotated. Rotated text at a
	 *  glance is unreadable, and glance is the whole point. */
	function labelAt(i: number): { x: number; y: number } {
		const a = wedgeCentre(i, items.length);
		const r = (INNER + OUTER) / 2;
		return { x: r * Math.cos(a), y: r * Math.sin(a) };
	}

	const size = (OUTER + PAD) * 2;
</script>

<svelte:window
	onpointermove={onmove}
	onpointerup={onup}
	onpointercancel={oncancel}
	onkeydown={onkey}
/>

{#if open}
	<!--
		A plain fixed layer rather than a <dialog>: the pie is opened by a
		pointerdown that must keep flowing to the window handlers above, and
		showModal() steals that. Nothing else on the app draws above z-50 outside
		a dialog, and the backdrop below catches every stray click.
	-->
	<div
		class="pie-layer fixed inset-0 z-[60]"
		role="presentation"
		oncontextmenu={(e) => e.preventDefault()}
	>
		<!--
			bg-scrim, never bg-black/40: `black` and `white` invert with the ramp in
			dark mode, so that scrim was white at 40% over a dark page — a flashbang
			on the menu people open most.
		-->
		<button
			type="button"
			class="absolute inset-0 h-full w-full bg-scrim"
			aria-label="Close"
			onclick={() => afterOpening(onclose)}
		></button>

		<div
			class="pie pointer-events-none absolute"
			style="left: {centre.x - size / 2}px; top: {centre.y -
				size / 2}px; width: {size}px; height: {size}px"
		>
			<svg viewBox="{-size / 2} {-size / 2} {size} {size}" class="h-full w-full overflow-visible">
				<!--
					An opaque disc under the wedges.
					A tint at 15% over a dimmed page is a stain rather than a menu: the
					page shows through it and the colour that is supposed to become
					muscle memory never registers. On its own surface the same tint
					reads as the section it stands for.
				-->
				<circle
					r={OUTER}
					fill="var(--color-white)"
					stroke="var(--color-gray-200)"
					stroke-width="1"
				/>

				{#each items as item, i (item.key)}
					{@const on = active === i}
					{@const p = labelAt(i)}
					<!-- The keyboard path is the arrow keys and Enter, on the window
					     above: a wedge is a shape, not a control, and focusing four of
					     them one at a time is a worse menu than the list in ⌘K. -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<g
						class="pointer-events-auto cursor-pointer transition-opacity"
						style="opacity: {active === -1 || on ? 1 : 0.45}"
						onpointerenter={() => (active = i)}
						onclick={() => afterOpening(() => onselect(item.key))}
						role="menuitem"
						tabindex="-1"
					>
						<path
							d={wedgePath(i)}
							fill={item.color}
							fill-opacity={on ? 0.95 : 0.16}
							stroke={item.color}
							stroke-opacity={on ? 1 : 0.35}
							stroke-width="1.5"
						/>
						<g style="color: {on ? '#fff' : item.color}" transform="translate({p.x} {p.y})">
							<g transform="translate(-11 -20)">
								<Icon name={item.icon} size={24} />
							</g>
							<!--
								11px, because the wedge is as wide as it is: at 13 the longest
								name in the ring — Notebooks — ran past its own slice and into
								the one beside it, and Shopping was touching the edge. The ring
								is sized for eight names, so the type is sized for the longest
								of them rather than the average.
							-->
							<text
								x="0"
								y="17"
								text-anchor="middle"
								fill="currentColor"
								class="text-[11px] font-semibold"
							>
								{item.label}
							</text>
						</g>
					</g>
				{/each}

				<!-- The hole. Let go here and nothing happens, which is what makes
				     the gesture safe to start. Escape does the same from the keyboard,
				     handled on the window above. -->
				<circle
					r={INNER - 2}
					class="fill-white stroke-gray-300"
					stroke-width="1.5"
					style="pointer-events: auto"
					onpointerenter={() => (active = -1)}
					onclick={() => afterOpening(onclose)}
					role="presentation"
				/>
				<text
					y="4"
					text-anchor="middle"
					class="fill-gray-500 text-[11px]"
					style="pointer-events: none">cancel</text
				>
			</svg>
		</div>
	</div>
{/if}

<style>
	/* Grows out of the point it was summoned from, so the gesture and the menu
	   are visibly the same act. */
	/*
	 * Nothing here is text you select or a page you scroll.
	 *
	 * Without these a press-and-hold on a phone starts a text selection over
	 * whichever wedge label is under the finger: a box appears around the word,
	 * the browser takes the gesture, and the release selects nothing.
	 */
	.pie-layer {
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	.pie {
		animation: bloom 140ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
		filter: drop-shadow(0 8px 24px rgb(0 0 0 / 0.35));
	}

	@keyframes bloom {
		from {
			opacity: 0;
			transform: scale(0.7);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pie {
			animation: none;
		}
	}
</style>
