<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { CLOSING_STEP, tutorialFor, type TutorialStep } from '$lib/tutorials';

	/**
	 * The guided tour: the screen goes dark, and one thing at a time does not.
	 *
	 * Built on `<dialog>` with `showModal()`, like every other full-screen thing
	 * here — the page renders inside a stacking context that nothing can climb
	 * out of, and the top layer is the only way over the header. It also brings
	 * the focus trap and Escape with it.
	 *
	 * The dark is drawn by the spotlight rather than by the backdrop: one box at
	 * the target's rectangle, with a shadow large enough to cover any screen
	 * spreading out from it. That is what makes the hole a hole, and it is why
	 * the whole thing animates for free — moving the box moves the light.
	 *
	 * Nothing behind is clickable while this is up, on purpose. A tour that
	 * invites you to press the thing it is pointing at is a tour that has to know
	 * what pressing it does; this one says what a thing is and gets out of the
	 * way.
	 */
	let {
		/** The section colour of the screen being toured — the ring, and the accents. */
		accent = '#4b5563',
		/** Told when the tour closes, so the shell can remember it was seen. */
		ondismiss
	}: {
		accent?: string;
		ondismiss?: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let card = $state<HTMLElement>();

	let open = $state(false);
	let index = $state(0);
	/** The steps of the tour actually running, closing step included. */
	let steps = $state<TutorialStep[]>([]);
	let label = $state('');

	const step = $derived(steps[index]);
	/** The closing step is the last one and is never counted as part of the tour. */
	const total = $derived(Math.max(steps.length - 1, 1));
	const isClosing = $derived(index === steps.length - 1);

	/* ------------------------------------------------------------ the target */

	/**
	 * The first match with a box on screen.
	 *
	 * One selector names both the control in the header and the one in the phone
	 * bar, because they are the same control at two sizes; whichever of them is
	 * being drawn is the one the step is about.
	 */
	function firstVisible(selector: string): Element | null {
		for (const el of document.querySelectorAll(selector)) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return el;
		}
		return null;
	}

	/**
	 * The steps this screen can actually show.
	 *
	 * A step whose target is nowhere is dropped rather than pointed nowhere —
	 * which is how one tour serves the phone and the laptop, and how a step
	 * about a card somebody has put away stops existing.
	 */
	function resolveSteps(path: string): TutorialStep[] | null {
		const tutorial = tutorialFor(path);
		if (!tutorial) return null;
		const usable = tutorial.steps.filter((s) => !s.target || firstVisible(s.target));
		return [...usable, CLOSING_STEP];
	}

	export function start() {
		const path = page.url.pathname;
		const resolved = resolveSteps(path);
		if (!resolved) return;
		label = tutorialFor(path)?.label ?? '';
		steps = resolved;
		index = 0;
		open = true;
	}

	/* ------------------------------------------------------- where things are */

	type Box = { top: number; left: number; width: number; height: number };
	/** The phone's panel is stretched to the screen; everywhere else the CSS width stands. */
	type CardBox = Box & { stretch?: boolean };

	let spot = $state<Box | null>(null);
	let cardBox = $state<CardBox | null>(null);
	/** Where the little pointer sits on the card, and which edge it is on. */
	let caret = $state<{ side: 'top' | 'bottom' | 'left' | 'right'; at: number } | null>(null);

	const GAP = 14; // between the lit rectangle and the card
	const PAD = 6; // how far the light spreads past the thing itself
	const EDGE = 16; // the closest the card comes to the edge of the screen

	function measure() {
		if (!open || !step) return;

		const target = step.target ? firstVisible(step.target) : null;
		const rect = target?.getBoundingClientRect() ?? null;

		spot = rect
			? {
					top: rect.top - PAD,
					left: rect.left - PAD,
					width: rect.width + PAD * 2,
					height: rect.height + PAD * 2
				}
			: null;

		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const cw = card?.offsetWidth ?? 320;
		const ch = card?.offsetHeight ?? 180;

		/*
		 * The phone gets a panel across the screen rather than a card beside
		 * something. There is no room for "beside" at 390px, and a sheet against
		 * an edge is what everything else in this app does down there — but it
		 * docks to whichever edge the lit thing is not near, so the tour never
		 * covers what it is pointing at.
		 */
		if (vw < 640) {
			const bottom = !spot || spot.top + spot.height / 2 < vh * 0.55;
			cardBox = {
				left: EDGE,
				top: bottom ? vh - ch - EDGE : EDGE,
				width: vw - EDGE * 2,
				height: ch,
				stretch: true
			};
			caret = null;
			return;
		}

		if (!spot) {
			cardBox = { left: (vw - cw) / 2, top: (vh - ch) / 2, width: cw, height: ch };
			caret = null;
			return;
		}

		const below = vh - (spot.top + spot.height) - GAP - EDGE;
		const above = spot.top - GAP - EDGE;
		const right = vw - (spot.left + spot.width) - GAP - EDGE;
		const left = spot.left - GAP - EDGE;

		// Under the thing first: a card below what it names reads as attached to
		// it. Beside it only when there is no room above or below.
		let side: 'top' | 'bottom' | 'left' | 'right';
		if (below >= ch) side = 'top';
		else if (above >= ch) side = 'bottom';
		else if (right >= cw) side = 'left';
		else if (left >= cw) side = 'right';
		else side = below >= above ? 'top' : 'bottom';

		const clamp = (v: number, max: number) => Math.max(EDGE, Math.min(v, max - EDGE));
		const centreX = spot.left + spot.width / 2;
		const centreY = spot.top + spot.height / 2;

		let top: number;
		let leftPos: number;
		if (side === 'top') {
			top = spot.top + spot.height + GAP;
			leftPos = clamp(centreX - cw / 2, vw - cw);
		} else if (side === 'bottom') {
			top = spot.top - GAP - ch;
			leftPos = clamp(centreX - cw / 2, vw - cw);
		} else if (side === 'left') {
			leftPos = spot.left + spot.width + GAP;
			top = clamp(centreY - ch / 2, vh - ch);
		} else {
			leftPos = spot.left - GAP - cw;
			top = clamp(centreY - ch / 2, vh - ch);
		}

		top = Math.max(EDGE, Math.min(top, vh - ch - EDGE));
		cardBox = { left: leftPos, top, width: cw, height: ch };

		// The caret sits on the card's edge, level with the middle of the lit
		// thing — clamped in from the corners, where a triangle on a rounded box
		// hangs off the side.
		const along =
			side === 'top' || side === 'bottom'
				? Math.max(18, Math.min(centreX - leftPos, cw - 18))
				: Math.max(18, Math.min(centreY - top, ch - 18));
		caret = { side, at: along };
	}

	/*
	 * Measured every frame while the tour is up.
	 *
	 * The alternative is a list of things to listen to — resize, scroll on
	 * whichever element happens to be scrolling, the end of the smooth scroll
	 * that brought the target into view, a card that reflowed because its text
	 * is two lines here and three there — and missing any one of them leaves the
	 * light beside the thing rather than on it. A rectangle read once a frame is
	 * cheap and cannot be out of date.
	 */
	$effect(() => {
		if (!open) return;
		let frame = 0;
		const tick = () => {
			measure();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	// `showModal()` is what puts it in the top layer; the `open` attribute alone
	// gives a dialog the site header still covers.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			/*
			 * On the card, not on the first button in it.
			 *
			 * `showModal()` focuses whatever is focusable first, which here is
			 * Dismiss — so the tour opened with a focus ring around the way out
			 * of it. The card takes the focus instead, which keeps the keys
			 * working and rings nothing.
			 */
			card?.focus();
		}
		if (!open && dialog.open) dialog.close();
	});

	/** Bring the step's target on screen before the light lands on it. */
	$effect(() => {
		if (!open || !step?.target) return;
		firstVisible(step.target)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	/* -------------------------------------------------------------- the moves */

	function next() {
		if (isClosing) return close();
		index = Math.min(index + 1, steps.length - 1);
	}

	function back() {
		index = Math.max(index - 1, 0);
	}

	/**
	 * Dismiss is two presses, and the first one is not a dismissal.
	 *
	 * It jumps to the closing step, which is the one that says where the tour
	 * lives afterwards. Somebody who leaves in the first ten seconds is exactly
	 * the person who needs to know it can be reopened, and they are also the
	 * only person who will never reach that step by pressing Next.
	 */
	function dismiss() {
		if (isClosing) return close();
		index = steps.length - 1;
	}

	function close() {
		open = false;
		spot = null;
		ondismiss?.();
	}

	/**
	 * On the window rather than on the dialog.
	 *
	 * A step whose buttons change — the closing one drops Back and Next — takes
	 * the focused element out from under the browser, which parks focus on the
	 * body. The body is not inside the dialog, so a handler bound there never
	 * heard the second Escape and the tour could not be closed from the keyboard
	 * at the exact step whose whole job is to end it.
	 */
	function onkeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			back();
		} else if (e.key === 'Escape') {
			// The dialog would close itself on Escape; the first one is a dismiss,
			// which means the closing step rather than the end.
			e.preventDefault();
			dismiss();
		}
	}
</script>

<svelte:window onresize={measure} {onkeydown} />

<dialog
	bind:this={dialog}
	oncancel={(e) => e.preventDefault()}
	onclose={() => (open = false)}
	aria-label="Tutorial"
	style="--tour-accent: {accent}"
>
	{#if open && step}
		<!--
			The dark, and the hole in it.

			One element: a rectangle over the thing being named, with a shadow
			wide enough to reach the corners of any screen. Because the dark is
			the shadow of this box, moving the box slides the light across the
			page — which is the whole animation, and it costs nothing.
		-->
		<div
			class="spot"
			class:blank={!spot}
			style={spot
				? `top:${spot.top}px;left:${spot.left}px;width:${spot.width}px;height:${spot.height}px`
				: `top:50%;left:50%;width:0;height:0`}
		></div>

		<div
			bind:this={card}
			tabindex="-1"
			class="card"
			style={cardBox
				? `top:${cardBox.top}px;left:${cardBox.left}px${
						cardBox.stretch ? `;width:${cardBox.width}px` : ''
					}`
				: 'opacity:0'}
		>
			{#if caret}
				<span class="caret {caret.side}" style="--at:{caret.at}px"></span>
			{/if}

			<div class="flex items-baseline justify-between gap-3">
				<span class="eyebrow" style="color: var(--tour-accent)">
					{isClosing ? 'One last thing' : label}
				</span>
				{#if !isClosing}
					<span class="tabular text-xs text-gray-500">{index + 1} / {total}</span>
				{/if}
			</div>

			<h2 class="mt-1 text-base font-semibold text-gray-900">{step.title}</h2>
			<p class="mt-1.5 text-sm text-gray-600">{step.body}</p>

			<div class="mt-4 flex items-center gap-3">
				{#if !isClosing}
					<!-- Where you are, without a second number to read. -->
					<div class="flex flex-1 items-center gap-1.5">
						{#each steps.slice(0, -1) as s, i (s.title)}
							<span
								class="dot"
								class:on={i <= index}
								style={i <= index ? 'background: var(--tour-accent)' : ''}
							></span>
						{/each}
					</div>
					<button type="button" class="btn btn-sm btn-quiet" onclick={dismiss}>Dismiss</button>
					{#if index > 0}
						<button type="button" class="btn btn-sm" onclick={back} aria-label="Back">
							<Icon name="chevron-left" size={16} />
						</button>
					{/if}
					<button type="button" class="btn btn-sm btn-primary" onclick={next}>
						Next <Icon name="chevron-right" size={16} />
					</button>
				{:else}
					<div class="flex-1"></div>
					<button type="button" class="btn btn-sm btn-primary" onclick={close}>
						Okay, dismiss!
					</button>
				{/if}
			</div>
		</div>
	{/if}
</dialog>

<style>
	/*
	 * A `<dialog>` arrives with a width, a margin and a border of its own, and
	 * unlayered rules are what override them reliably. Transparent throughout:
	 * everything visible here is drawn by the two children.
	 */
	dialog {
		position: fixed;
		inset: 0;
		width: 100%;
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0;
		border: 0;
		padding: 0;
		background: transparent;
		overflow: hidden;
	}

	/* The dark is the spotlight's shadow, so the backdrop stays out of it. */
	dialog::backdrop {
		background: transparent;
	}

	.spot {
		position: fixed;
		border-radius: var(--radius-md, 0);
		/* 200vmax so the corners are covered whatever the aspect ratio, and
		   whatever corner the lit thing is in. */
		/*
		 * Accent inside, white outside.
		 *
		 * The ring is the section's colour, and half the sections are dark — on
		 * the navigation bar, which is nearly black, a slate ring is invisible.
		 * The hairline of white outside it separates the lit thing from the dark
		 * whatever the colour and whatever it is sitting on.
		 */
		box-shadow:
			0 0 0 2px var(--tour-accent),
			0 0 0 3px rgb(255 255 255 / 0.9),
			0 0 0 200vmax rgb(8 11 17 / 0.74);
		transition:
			top 260ms cubic-bezier(0.32, 0.72, 0, 1),
			left 260ms cubic-bezier(0.32, 0.72, 0, 1),
			width 260ms cubic-bezier(0.32, 0.72, 0, 1),
			height 260ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	/* A step about the room rather than a part of it: no hole, just the dark. */
	.spot.blank {
		box-shadow: 0 0 0 200vmax rgb(8 11 17 / 0.74);
	}

	.card {
		position: fixed;
		/*
		 * One column, the width of a paragraph.
		 *
		 * Left to itself the card took whatever width its longest sentence
		 * wanted — a thousand pixels of one line across the middle of the
		 * screen, which reads as a system message rather than as a note beside
		 * the thing it is about. The phone overrides this from the script,
		 * where the panel is the width of the screen.
		 */
		width: min(23rem, calc(100vw - 2rem));
		max-width: calc(100vw - 2rem);
		background: var(--color-white);
		border: 1px solid var(--color-gray-200);
		border-radius: var(--radius-md, 0);
		box-shadow: var(--shadow-overlay);
		padding: 1rem 1.125rem 1.125rem;
		animation: tour-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
		transition:
			top 260ms cubic-bezier(0.32, 0.72, 0, 1),
			left 260ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	/* Focused so the keys work, not so it draws a ring around itself. */
	.card:focus {
		outline: none;
	}

	@keyframes tour-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	/* The tie between the card and the thing it names. A square on its corner,
	   with two of its sides hidden behind the card. */
	.caret {
		position: absolute;
		width: 10px;
		height: 10px;
		background: var(--color-white);
		border: 1px solid var(--color-gray-200);
		transform: rotate(45deg);
	}
	.caret.top {
		top: -6px;
		left: var(--at);
		margin-left: -5px;
		border-right: 0;
		border-bottom: 0;
	}
	.caret.bottom {
		bottom: -6px;
		left: var(--at);
		margin-left: -5px;
		border-top: 0;
		border-left: 0;
	}
	.caret.left {
		left: -6px;
		top: var(--at);
		margin-top: -5px;
		border-top: 0;
		border-right: 0;
	}
	.caret.right {
		right: -6px;
		top: var(--at);
		margin-top: -5px;
		border-bottom: 0;
		border-left: 0;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: var(--color-gray-300);
		transition: background 160ms ease;
	}

	/* The light slides, unless the machine has been asked not to move. */
	@media (prefers-reduced-motion: reduce) {
		.spot,
		.card {
			transition: none;
			animation: none;
		}
	}
</style>
