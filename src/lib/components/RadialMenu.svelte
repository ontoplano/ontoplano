<script lang="ts">
	import mark from '$lib/logo/mark.png';
	import liftedMark from '$lib/logo/mark-lifted.png';
	import { MARK_FIELD, MARK_FIELD_LIFTED } from '$lib/logo/mark-shape';
	import { MARK_DRAINED } from '$lib/logo/brand';
	import { markPath, markPoints } from '$lib/logo/mark-geometry';
	import { isIsolatedBuild } from '$lib/isolated/mode';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { wedgeAt, wedgeCentre, wedgeEdges, wedgeStep } from '$lib/radial';
	import { useT } from '$lib/i18n';

	const t = useT();

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
		/**
		 * What stands in the middle.
		 *
		 * `mark` for the rooms — the wheel is the logo, so its middle is the
		 * logo. `plus` for the capture wheel, which is summoned from the `+`
		 * in the bar and has nothing to do with the brand: a wheel that flew
		 * the logo up out of the plus button was answering with the wrong
		 * thing entirely.
		 */
		middle = 'mark',
		/**
		 * How big the wheel is drawn, against the rooms wheel's own size.
		 *
		 * The rooms are eight places and a whole screen of wheel is right for
		 * them. Capture is four small things written down in passing, and at
		 * the same size it was a bigger interruption than what it was for.
		 * Everything below is in these units, so one number moves the whole
		 * drawing — the hit test with it.
		 */
		scale = 1,
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
		onclose,
		/**
		 * Whether the wheel is on screen at all — which outlasts `open`, because
		 * the middle takes a moment to fly home. The bar keeps the socket it
		 * came out of empty until it lands.
		 */
		onvisible
	}: {
		middle?: 'mark' | 'plus';
		scale?: number;
		items: Wedge[];
		open?: boolean;
		origin?: { x: number; y: number };
		anchor?: { x: number; y: number } | null;
		dragging?: boolean;
		bottomInset?: number;
		onselect: (key: string) => void;
		onclose: () => void;
		onvisible?: (visible: boolean) => void;
	} = $props();

	// A tenth wider than it first shipped: at 132 the slices were tight enough
	// that a name and its glyph fought for the same band.
	/**
	 * An id of this instance's own, for the clip path.
	 *
	 * Two of these are on the page at once — the rooms and the capture wheel —
	 * and an `id` is global to the document: with a literal, whichever mounted
	 * second would be cutting both of them to its own shape.
	 */
	const clipId = `pie-mark-${Math.random().toString(36).slice(2, 8)}`;

	const OUTER = $derived(145 * scale);

	/**
	 * How thick the rim is, and how big the hole is.
	 *
	 * The rim is the mark's ring at this size; eight pixels is what that ring
	 * looks like when the whole drawing is two hundred and ninety across. The
	 * hole is the mark's middle at the same scale, so the medallion in it is
	 * the size it would be if the wheel simply were the logo — which is the
	 * idea.
	 */
	const RIM = $derived(8 * scale);

	/**
	 * How much of the hole the mark in the middle takes.
	 *
	 * All of it. The hole is the mark's shape at the same size, so the two edges
	 * are one edge: the wedges stop where the mark begins and there is no band
	 * of ground between them for the eye to read as a ring.
	 */
	const MIDDLE_INSET = 1;

	/**
	 * How much of the theme's ink goes into a wedge's glyph and name.
	 *
	 * Enough that the eight are plainly legible on either ground, not so much
	 * that they stop being eight colours. The colour still carries which room
	 * it is; the ink carries that it is a word.
	 */
	const GLYPH_INK = 55;

	/**
	 * What an edge is when it is nobody's.
	 *
	 * The mark's own dark, measured off `mark.png` by `yarn icons` — the same
	 * colour the drawing separates its wedges with, and the one the phone bar
	 * wears. It was pure black, which is a colour the drawing does not
	 * contain: a wheel made of the mark is made of the mark's colours.
	 *
	 * Dark in both themes, deliberately: the wheel is a ring of wedges over a
	 * dimmed page, and an edge that followed the theme would be a white
	 * outline in the dark one — a second bright shape competing with the mark
	 * in the middle.
	 */
	const EDGE_DARK = $derived(isIsolatedBuild() ? MARK_FIELD_LIFTED : MARK_FIELD);

	/**
	 * A circle, as a path, for a clip that also holds the mark's outline.
	 *
	 * `<clipPath>` takes one shape per child and `clip-rule="evenodd"` needs
	 * both rings in a single `d` — so the outer one cannot be a `<circle>`
	 * element. Two half-turn arcs are the same circle written as a path.
	 */
	function circlePath(r: number): string {
		return `M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 Z`;
	}

	const INNER = $derived(57 * scale);
	const HOLE = $derived(INNER - 2 * scale);

	/** Inside the ring that the inner band draws, which is where the mark goes. */
	/**
	 * The mark fills the hole.
	 *
	 * There used to be a black ring drawn between the two — the mark's own
	 * ring, redrawn at wheel size — which took eight pixels from the wedges
	 * and put a second outline inside the one the wheel already has. Without
	 * it the wedges reach the mark and the mark reaches them, which is what
	 * the drawing does.
	 */
	const MEDALLION = $derived(HOLE * MIDDLE_INSET);

	/*
	 * On the device, the mark in the middle is drained of its colour.
	 *
	 * Somebody can be running both at once — the instance on this phone and the
	 * one on a server — and the two are the same app to look at, which is a bad
	 * way to find out which week you have just written into. The main menu is
	 * where that question gets asked, so it is where the answer is: the same
	 * mark, nearly black and white, the way the dev and staging icons have said
	 * "not the ordinary copy" since there were two builds on one phone.
	 */
	const drained = $derived(isIsolatedBuild() ? `saturate(${MARK_DRAINED})` : 'none');

	/*
	 * And the same drawing with its dark lifted, for the same reason.
	 *
	 * Draining takes the colour out of the ring and leaves the field as dark as
	 * it was, which closes the middle of the wheel into a near-black disc. The
	 * lifted copy is the mark with that field a little nearer white, so the
	 * wheel on the device reads as the mark with the lights off rather than as
	 * a hole. The wheel's own dark follows it, or the hole and the mark in it
	 * would be two different darks.
	 */
	const artwork = $derived(isIsolatedBuild() ? liftedMark : mark);

	/**
	 * Where a wedge starts, which is inside the hole rather than at its edge.
	 *
	 * The hole is an octagon and a wedge is drawn with arcs, so the two only
	 * meet where the octagon's corners are. Starting at its inner circle — the
	 * distance to the middle of a side — puts the whole of the hole's outline
	 * inside painted wedge, and the clip cuts it back to exactly that outline.
	 */
	const WEDGE_INNER = $derived(HOLE * Math.cos(Math.PI / 8) - scale);
	/** Room for the ring plus the shadow it casts. */
	const PAD = $derived(13 * scale);

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
			blooming = false;

			// Down the way it came. The wheel keeps its place for the length of
			// one flight while its middle travels back to the button, because a
			// thing that vanished and a thing that went home are different
			// animations and only one of them is true.
			if (!mounted) return;
			mounted = false;
			leaving = true;
			const gone = setTimeout(() => {
				shown = false;
				leaving = false;
			}, FLY_MS);
			return () => clearTimeout(gone);
		}
		mounted = true;
		shown = true;
		leaving = false;
		const margin = OUTER + PAD;
		const at = anchor ?? origin;
		centre = {
			x: Math.min(Math.max(at.x, margin), window.innerWidth - margin),
			y: Math.min(Math.max(at.y, margin), window.innerHeight - margin - bottomInset)
		};
		held = dragging;
		travelled = 0;

		// Arriving. Nothing the pointer sweeps over on the way counts.
		blooming = true;
		const settled = setTimeout(() => (blooming = false), BLOOM_MS);
		return () => clearTimeout(settled);
	});

	/**
	 * Where the wheel grows from, inside its own box.
	 *
	 * The press is a point on the screen and the box has just been placed
	 * around it — usually centred on it, but pushed in when the press was near
	 * an edge, which is exactly when the difference shows. Measuring it here
	 * rather than assuming the middle is what keeps the mark still: press the
	 * button in the corner of the phone bar and the wheel still comes out of
	 * the button rather than sliding in from where it would rather be.
	 */
	const grewFrom = $derived.by(() => {
		const at = anchor ?? origin;
		return { x: at.x - (centre.x - size / 2), y: at.y - (centre.y - size / 2) };
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
	 * How long the wheel takes to arrive, and the fact that it is still
	 * arriving.
	 *
	 * Nothing under the pointer is chosen while it does. The wheel grows out of
	 * the button now, which means that for the first frames it is small and
	 * centred on the pointer — so a wedge sweeps past underneath, its
	 * `pointerenter` fires, and the thing you have not chosen yet is the thing
	 * the arrow keys start from. The first press of ArrowRight then lands one
	 * wedge further along than anybody meant, which is how this was found.
	 *
	 * The number is here and the animation is told it, rather than the two
	 * agreeing by being typed out twice.
	 */
	const BLOOM_MS = 190;

	/*
	 * The flight of the thing in the middle.
	 *
	 * The wheel blooms out of the button, which already carries its middle
	 * most of the way — so a flight that only spanned button-to-centre was a
	 * few dozen pixels and over before the eye found it. `FLY_REACH` starts it
	 * further down that same line, so the rise is a movement of its own.
	 *
	 * Both wheels fly at the same speed: they are the same gesture from the
	 * same bar, and a logo that took longer than the plus read as a different
	 * animation rather than the same one.
	 */
	const FLY_REACH = 1.9;
	const FLY_MS = BLOOM_MS * 1.3;
	let blooming = $state(false);
	/** On screen, which is `open` plus the flight home. */
	let shown = $state(false);
	let leaving = $state(false);
	/** The same fact, untracked, so the effect can guard on it without looping. */
	let mounted = false;

	$effect(() => onvisible?.(shown));

	/** Hovering a wedge chooses it, once the wheel has stopped moving. */
	function hover(i: number) {
		if (!blooming) active = i;
	}

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

		/*
		 * Drawn from inside the hole, not from the edge of it.
		 *
		 * The clip is what cuts the middle out, and it cuts an octagon — whose
		 * flat sides are nearer the centre than its corners are. A wedge that
		 * started at the hole's own radius therefore stopped short along four of
		 * the eight directions, and the ground showed through as a pale ring
		 * around the mark. Starting inside the octagon's inner circle and letting
		 * the clip do the work means the two edges are the same edge.
		 */
		return [
			`M ${at(WEDGE_INNER, from)}`,
			`L ${at(OUTER, from)}`,
			`A ${OUTER} ${OUTER} 0 ${big} 0 ${at(OUTER, to)}`,
			`L ${at(WEDGE_INNER, to)}`,
			`A ${WEDGE_INNER} ${WEDGE_INNER} 0 ${big} 1 ${at(WEDGE_INNER, from)}`,
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

	const size = $derived((OUTER + PAD) * 2);

	/*
	 * Where the middle of the wheel flies in from: the press itself.
	 *
	 * Not `grewFrom`, which takes the anchor when there is one — and the rooms
	 * wheel is anchored at its own drawn position on any screen narrower than
	 * a laptop, so that vector is zero and the logo had nowhere to come from.
	 * Only the capture wheel, which has no anchor, appeared to fly. The finger
	 * was on the bar either way; that is where it comes from.
	 */
	const flyFrom = $derived({
		x: origin.x - (centre.x - size / 2),
		y: origin.y - (centre.y - size / 2)
	});
	/**
	 * Says on the document that a menu is open, for the things that float.
	 *
	 * The reminder card is fixed above everything so that it is seen; the pie is
	 * fixed above everything because a finger is on it. Both being right is what
	 * put a toast across the middle of the menu somebody was in the middle of
	 * using. Rather than another round of z-index — which only decides which one
	 * covers the other — the floating layers step aside for the duration of a
	 * gesture and come back when it ends. `layout.css` has the rule.
	 */
	$effect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		if (open) root.dataset.pieOpen = '';
		else delete root.dataset.pieOpen;
		return () => delete root.dataset.pieOpen;
	});
</script>

<svelte:window
	onpointermove={onmove}
	onpointerup={onup}
	onpointercancel={oncancel}
	onkeydown={onkey}
/>

{#if shown}
	<!--
		A plain fixed layer rather than a <dialog>: the pie is opened by a
		pointerdown that must keep flowing to the window handlers above, and
		showModal() steals that. Nothing else on the app draws above z-50 outside
		a dialog, and the backdrop below catches every stray click.
	-->
	<div
		class="pie-layer fixed inset-0 z-[60] {leaving ? 'is-leaving' : ''}"
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
			aria-label={t('ui.close')}
			onclick={() => afterOpening(onclose)}
		></button>

		<!--
			What is under the thumb, said where the thumb is not.
			
			On a phone the finger covers the wedge it is on — the whole of it, icon
			and name — so the one piece of information the gesture depends on is
			the one thing hidden while it is being made. The name goes to the top
			of the screen instead, big enough to read without looking for it, and
			the wedge keeps only its icon.
			
			A desktop pointer covers nothing, so this is coarse-pointer only and
			the wedges keep their labels there.
		-->
		<div class="pie-hud pointer-events-none" aria-hidden="true">
			{#if active !== -1}
				{@const chosen = items[active]}
				<div class="pie-hud-inner" style="color: {chosen.color}">
					<span class="pie-hud-icon"><Icon name={chosen.icon} size={56} /></span>
					<span>{chosen.label}</span>
				</div>
			{/if}
		</div>

		<div
			class="pie pointer-events-none absolute"
			style="left: {centre.x - size / 2}px; top: {centre.y -
				size /
					2}px; width: {size}px; height: {size}px; --pie-from: {grewFrom.x}px {grewFrom.y}px; --pie-to: {flyFrom.x}px {flyFrom.y}px; --pie-bloom: {BLOOM_MS}ms"
		>
			<svg viewBox="{-size / 2} {-size / 2} {size} {size}" class="h-full w-full overflow-visible">
				<!--
					The wheel is the shape of the mark.
					
					An octagon rather than a circle, and not an octagon of its own: the
					points come from the outline measured off `mark.png`, so the ring
					the rooms sit in has the same edge as the button that opened it and
					the icon in the middle of it. One shape, three sizes.
				-->
				<!--
					The ring the wedges live in, as one shape with a hole in it.
					
					Two octagons and `evenodd`, so the inside edge of every wedge is the
					mark's shape as well. It was the arc each wedge is drawn with, which
					put a circle in the middle of a thing made of straight lines — and
					the mark sitting in that circle looked like it had been dropped in
					rather than cut from it.
				-->
				<defs>
					<!--
						Round outside, the mark's own shape inside.
						
						The outer edge used to be the mark's octagon too, scaled up —
						eight corners around something the thumb sweeps in an arc, and
						at this size the flats read as a crudely drawn circle rather
						than as the logo. The hole keeps the outline, because the hole
						is the mark and the mark has corners.
					-->
					<clipPath id={clipId} clip-rule="evenodd">
						<path d="{circlePath(OUTER)} {markPath(HOLE)}" clip-rule="evenodd" />
					</clipPath>
				</defs>
				<!--
					An opaque ground under the wedges.
					A tint at 15% over a dimmed page is a stain rather than a menu: the
					page shows through it and the colour that is supposed to become
					muscle memory never registers. On its own surface the same tint
					reads as the section it stands for.
				-->
				<circle r={OUTER} fill="var(--color-white)" />

				<!--
					Cut to the octagon, which is what makes each wedge a trapezoid.
					
					The paths are still drawn as segments of a circle at the octagon's
					own radius — every corner of the shape is exactly `OUTER` from the
					middle — so clipping trims each one back to the flat edge it sits
					behind. With the eight rooms the app ships, a wedge is one side of
					the octagon and two straight cuts. With fewer, because somebody
					hid a room, the shape still fills the octagon rather than leaving a
					circle inside it.
				-->
				<g clip-path="url(#{clipId})">
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
							onpointerenter={() => hover(i)}
							onclick={() => afterOpening(() => onselect(item.key))}
							role="menuitem"
							tabindex="-1"
						>
							<path
								d={wedgePath(i)}
								fill={item.color}
								fill-opacity={on ? 0.32 : 0.16}
								stroke={item.color}
								stroke-opacity={on ? 0.7 : 0.35}
								stroke-width="1.5"
							/>
							<!--
							The room's colour, pulled most of the way to the ink.
							
							At full strength a wedge's own colour on the wheel's ground is
							the section reading as a stain rather than as a word: dark
							violet on a dark panel, pale amber on a light one. `--color-black`
							is the theme's ink — white in the dark theme, black in the light
							one — so one expression is high contrast in both, and what
							survives of the colour is enough to tell the eight apart.
						-->
							<g
								style="color: color-mix(in srgb, var(--color-black) {GLYPH_INK}%, {item.color})"
								transform="translate({p.x} {p.y})"
							>
								<g transform="translate({-12 * scale} {-12 * scale})">
									<Icon name={item.icon} size={24 * scale} />
								</g>
							</g>
						</g>
					{/each}
				</g>

				{#if active >= 0}
					{@const lit = items[active].color}
					<!--
						The glow of the chosen wedge, and nothing but the wedge.

						Drawn here, with the wedges, so both rims are painted over
						it: the light stops at the black edges instead of washing
						across them. It sat after the rim bands, which is why the
						outer one came up tinted while the inner one did not.

						The black edges do not change: they are the limits of the
						selection, and light must not cross them into a neighbour. So
						the glow is not a shadow cast outward — it is a radial wash in
						the room's own colour, brightening away from the centre, drawn
						inside the wedge's own shape and cut to the ring like every
						wedge is. Contained is the point: the light ends exactly at
						the borders, which is what lets it burn brighter inside them.
						A gradient rather than a blur, so the falloff is smooth and
						owes nothing to a filter radius.
					-->
					<defs>
						<radialGradient
							id="{clipId}-glow"
							gradientUnits="userSpaceOnUse"
							cx="0"
							cy="0"
							r={OUTER}
						>
							<stop offset="35%" stop-color={lit} stop-opacity="0" />
							<stop offset="72%" stop-color={lit} stop-opacity="0.45" />
							<stop offset="100%" stop-color={lit} stop-opacity="0.92" />
						</radialGradient>
					</defs>
					<g clip-path="url(#{clipId})" style="pointer-events: none">
						<path d={wedgePath(active)} fill="url(#{clipId}-glow)" />
					</g>
				{/if}

				<!-- The hole. Let go here and nothing happens, which is what makes
				     the gesture safe to start. Escape does the same from the keyboard,
				     handled on the window above. The mark is drawn over it below —
				     an element, not a shape, so it is the same picture as everywhere
				     else rather than a copy of it in paths. -->
				<!--
					The logo, whole, in the middle of its own wheel.
					
					Not a piece of it: the rim out there is the ring at wheel size and
					this is the middle of it, with its ring cropped away — the band
					around it is that ring, drawn, so that it can be black when nothing
					is chosen and the room's colour when something is.
					
					Drawn in the SVG rather than laid over it in HTML. As an element of
					its own it was a box positioned by percentages against a shape
					placed by coordinates, and the two agreed to within a few pixels —
					which showed as a pale ring around the mark in the light theme and
					was invisible in the dark one. Here it is the same units as the hole
					it fills.
				-->
				<!--
					And it flies there from the button that opened it.

					The wheel blooms in place; the mark comes up out of the bar —
					which is where it was a moment ago and where the finger still
					is — and lands in the middle. `--mark-from` is that button's
					place in this drawing's own coordinates, so the same markup
					works wherever the wheel was summoned from.
				-->
				<g
					class="pie-mark"
					style="--mark-from-x: {(flyFrom.x - size / 2) * FLY_REACH}px; --mark-from-y: {(flyFrom.y -
						size / 2) *
						FLY_REACH}px; --mark-home-x: {flyFrom.x - size / 2}px; --mark-home-y: {flyFrom.y -
						size / 2}px; --mark-fly: {Math.round(FLY_MS)}ms"
				>
					<!--
						The whole mark, not its middle.

						It used to be scaled so that the medallion alone filled the
						hole and the ring was cropped away — which made the thing in
						the wheel a different drawing from the one in the bar it came
						out of. The logo includes its ring; this is the logo.
					-->
					{#if middle === 'plus'}
						<!-- The same plus that is in the bar, at the size of the hole.
						     Drawn rather than an icon at a size: this one is as big as
						     the middle of the wheel, and a glyph scaled that far is a
						     glyph with the wrong weight. -->
						<g style="pointer-events: none">
							<!--
								A ground for it, in the mark's own dark.

								The hole is transparent — it is the wheel's way of saying
								"let go here and nothing happens" — and the plus is drawn
								in the chrome's ink, which is white. On a light page that
								was white on white: the middle of the capture wheel was
								empty. The logo brings its own dark field to this same
								hole; this is that field, in the same outline, so the two
								wheels have the same middle made of different things.
							-->
							<polygon points={markPoints(HOLE)} fill={EDGE_DARK} />
							<path
								d="M 0 {-MEDALLION * 0.52} V {MEDALLION * 0.52} M {-MEDALLION *
									0.52} 0 H {MEDALLION * 0.52}"
								stroke="var(--color-chrome-ink)"
								stroke-width={MEDALLION * 0.16}
								stroke-linecap="round"
								fill="none"
							/>
						</g>
					{:else}
						<image
							href={artwork}
							x={-MEDALLION}
							y={-MEDALLION}
							width={MEDALLION * 2}
							height={MEDALLION * 2}
							style="pointer-events: none; filter: {drained}"
						/>
					{/if}
				</g>

				<polygon
					points={markPoints(HOLE)}
					class="pie-hole"
					fill="transparent"
					style="pointer-events: all"
					onpointerenter={() => hover(-1)}
					onclick={() => afterOpening(onclose)}
					role="presentation"
				>
					<!-- It used to say the word. The mark says it now, which is only
					     true for somebody looking at it — this is the half that is not,
					     and it is what the tests press. Not `role="button"`: the way in
					     from a keyboard is Escape and the arrow keys, on the window, the
					     same as it is for the wedges. -->
					<title>{t('ui.cancel')}</title>
				</polygon>

				<!--
					The ring, on the outside where it belongs.
					
					One stroked circle. It used to be eight mitred bands following the
					mark's outline, which is what the ring in the picture is — but the
					outer edge is round now, and a circle has no corners for two bands
					to meet badly at. Drawn last so the wedges end under it rather than
					beside it: the rim is the edge of the whole thing, not a border
					around each piece.
					
					Inset by half its width, because a stroke is centred on its path:
					on the radius itself, half of it would hang outside the shape the
					clip allows and come back cut in half.
				-->
				<!--
					Both edges, black, until something is chosen.
					
					The wheel is a ring of wedges over a dimmed page: an outline that
					followed the theme would be a white shape in the dark one,
					competing with the mark in the middle. Black reads as the gap
					between the pieces, which is what it is until one of them is
					being pointed at.
				-->
				<circle
					r={OUTER - RIM / 2}
					fill="none"
					stroke={EDGE_DARK}
					stroke-width={RIM}
					class="pie-edge"
					style="pointer-events: none"
				/>

				<!--
					And then the chosen room's colour, on the two edges that are its
					own — the outer rim and the inner one, the two sides of the piece
					being pointed at.
					
					Darker than the wedge it borders, not the same: at full strength
					the edge and the fill are one block of colour and the wedge stops
					having an outline exactly when it most needs one. Same hue, less
					light — which is what a border is.
					
					Cut to the wedge rather than worked out side by side. With the
					eight rooms the app ships a wedge is exactly one side of the
					octagon, but hide a room and it is one and a half: clipping the
					whole ring to the wedge's own shape is right for any number of
					them, and cannot get the mapping wrong because there is no
					mapping.
				-->
			</svg>

			<!--
				The mark in the hole, which is the way out.
				
				It is the thing that was pressed to get here: the wheel grows out of
				it and it stays in the middle, so letting go on it is letting go of
				where you started. Nothing under the pointer moves when the wheel
				opens, which is the whole reason the gesture is safe.
			-->
		</div>
	</div>
{/if}

<style>
	/*
	 * The name of what is chosen, big, at the top of the screen — everywhere.
	 *
	 * On a touch screen the finger covers the wedge, so the name has to be
	 * said somewhere else. On a desktop it used to live in the wedges as
	 * eleven-pixel labels — a ring of small words to squint at. One reading
	 * now: the wedges say their icon, and the name is said once, large.
	 */
	.pie-hud {
		position: fixed;
		/* A fifth of the way down: clear of the status bar and the app's own
			   header, and well above the ring, which sits under the thumb. */
		top: 22%;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		/* Above the scrim and the wheel; it is the label for both. */
		z-index: 1;
	}

	/*
		 * Outlined letters over the page, with no card behind them.
		 *
		 * A panel would be a second surface floating over a dimmed page, and the
		 * dimming is already doing that job. What the letters need is not a
		 * background but an edge: the section's colour filled, the page's own
		 * ground stroked around it, so the name reads over a busy dashboard,
		 * a photograph or a dark theme without carrying a box around with it.
		 *
		 * `paint-order` puts the stroke behind the fill; without it the stroke is
		 * drawn centred on the glyph and eats half the letter.
		 */
	.pie-hud-inner {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		font-size: 2.5rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		/* The tracking above pushes the last letter off centre by its own
			   width; this takes it back. */
		text-indent: 0.08em;
		line-height: 1.05;
		text-transform: uppercase;
		paint-order: stroke fill;
		-webkit-text-stroke: 5px var(--color-white);
		stroke: var(--color-white);
		stroke-width: 5px;
	}

	/* The icon is a line drawing already, so it takes the same treatment the
		   letters do: its own stroke widened, drawn under itself. */
	.pie-hud-icon :global(svg) {
		stroke-width: 2.25;
		filter: drop-shadow(0 0 10px var(--color-white)) drop-shadow(0 0 20px var(--color-white));
	}

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
		animation: bloom var(--pie-bloom, 190ms) cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
		filter: drop-shadow(0 8px 24px rgb(0 0 0 / 0.35));
		/* Set on the element: where the press happened, so the wheel comes out
		   of the button rather than out of the middle of the screen. */
		transform-origin: var(--pie-from, 50% 50%);
	}

	/*
	 * The mark's own journey, up from the bar into the middle.
	 *
	 * It travels a little longer than the wheel takes to bloom and lands with
	 * a touch of overshoot, so it reads as the thing you pressed arriving
	 * rather than as part of the wheel growing.
	 */
	.pie-mark {
		/*
		 * Longer than the bloom, so the mark lands after the wheel rather than
		 * with it — at the bloom's own pace the whole journey was over inside a
		 * fifth of a second, which is not something an eye catches.
		 */
		animation: mark-arrives var(--mark-fly, 500ms) cubic-bezier(0.16, 0.7, 0.22, 1.06) both;
	}

	@keyframes mark-arrives {
		from {
			transform: translate(var(--mark-from-x, 0), var(--mark-from-y, 0)) scale(0.32);
		}
		to {
			transform: translate(0, 0) scale(1);
		}
	}

	/*
	 * It grows out of the button, at the size of the button.
	 *
	 * `0.28` is not a taste: the mark in the middle of the wheel is
	 * `(INNER - 2) * 2` across — 110px — and the mark on the button is 32, so a
	 * wheel at 0.29 of itself has a centre exactly the size of the thing that
	 * was pressed. Start there, with the origin at the press, and the one
	 * picture on screen never changes size or place: it stays put while the
	 * rooms bloom out around it.
	 */
	@keyframes bloom {
		from {
			opacity: 0;
			transform: scale(0.29);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/*
	 * And the whole thing in reverse, on the way out.
	 *
	 * The same two keyframes played backwards rather than a second pair: the
	 * wheel shrinks back into the button it grew from and the mark rides back
	 * down to it, which is the only honest ending for an animation that said
	 * the button's own mark had flown up. While it happens nothing on the
	 * layer takes a press — the menu is already closed, this is just the way
	 * it leaves.
	 */
	.pie-layer.is-leaving {
		pointer-events: none;
	}

	/* Their own names, not `animation-direction: reverse` on the arrivals: a
	   finished animation does not restart when one of its properties changes,
	   so reversing it in place snapped straight to the far keyframe. */
	/*
	 * Back into the button, not into its own middle.
	 *
	 * `--pie-from` is where the wheel grew from, which on a phone is the place
	 * it is drawn — above the hand, so the eight rooms are not under it. Going
	 * out that way it collapsed on itself two hundred pixels up, and the mark
	 * riding inside it reached a fraction of the way home: the shrinking parent
	 * scales its own journey down with it. `--pie-to` is the press instead, so
	 * everything converges on the button the way the capture wheel already did.
	 */
	.pie-layer.is-leaving .pie {
		/* The flight's length, not the bloom's: the wheel and the thing in its
		   middle have to land together, and at the bloom's pace the wheel was
		   gone a frame or two before the socket in the bar filled again. */
		animation: bloom-away var(--mark-fly, 500ms) cubic-bezier(0.4, 0, 0.7, 0.2) both;
		transform-origin: var(--pie-to, 50% 50%);
	}

	/* And its own hop on top of the wheel's, the same one it made coming up. */
	.pie-layer.is-leaving .pie-mark {
		animation: mark-departs var(--mark-fly, 500ms) cubic-bezier(0.4, 0, 0.7, 0.2) both;
	}

	/* Opaque nearly the whole way, so what the eye follows down is the mark
	   rather than a wheel dissolving in mid-air. */
	@keyframes bloom-away {
		0% {
			opacity: 1;
			transform: none;
		}
		65% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: scale(0.29);
		}
	}

	/*
	 * Home is the button, not the runway it took off down.
	 *
	 * `FLY_REACH` starts the rise further down the same line so that the flight
	 * up is long enough to read as movement. Landing there is a different
	 * matter: it is past the button, off the bottom of the bar, so the mark
	 * dropped below where it belonged and the bar's own button reappearing read
	 * as it bouncing back up. Going home means going to the button.
	 */
	@keyframes mark-departs {
		to {
			transform: translate(var(--mark-home-x, 0), var(--mark-home-y, 0)) scale(0.32);
		}
	}

	.pie-layer.is-leaving :global(.bg-scrim) {
		animation: scrim-fades var(--pie-bloom, 190ms) ease-in both;
	}

	@keyframes scrim-fades {
		to {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pie,
		.pie-mark {
			animation: none;
		}
	}
</style>
