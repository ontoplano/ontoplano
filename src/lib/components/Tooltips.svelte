<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Every tooltip in the app, drawn by the app.
	 *
	 * There are three hundred of them and they are all the same thing: a
	 * `title` on a button. The browser's own rendering of that is a beige box
	 * in a system font with a system delay, which is the one piece of the
	 * interface that has never looked like the rest of it — and it is the piece
	 * that appears when somebody is unsure, which is the worst moment to look
	 * like a different program.
	 *
	 * So nothing is swept and nothing is rewritten: this listens for a pointer
	 * arriving on anything carrying a `title`, takes the attribute off so the
	 * browser has nothing to draw, and draws it here instead. The attribute
	 * goes back the moment the pointer leaves, so the DOM is only ever
	 * different while somebody is looking at our version of it — which matters,
	 * because a `title` is also an accessible name where there is no
	 * `aria-label`.
	 *
	 * Only where there is a pointer that hovers. A phone never showed these at
	 * all, and a tooltip that appears on a tap is a tooltip in the way.
	 */

	/** How long a pointer rests before the label appears. The browser's own is
	 *  about half a second; this is a little quicker, because ours is quieter. */
	const DELAY_MS = 380;
	/** How far off the element it sits. */
	const GAP = 8;
	/** Clear of the window's edges. */
	const MARGIN = 8;
	/** Longer than this and it is not a tooltip; it is a paragraph. */
	const MAX_LENGTH = 160;

	/*
	 * What is on screen, and what wants to be.
	 *
	 * The split matters. These listeners are on the document, and a `focusin`
	 * can fire in the middle of Svelte's own render — an autofocused input on
	 * the page being drawn is exactly that — and writing `$state` from inside a
	 * render is `state_unsafe_mutation`, which throws. So the bookkeeping is
	 * plain variables, which anybody may write at any time, and the three
	 * things the template reads are only ever written from inside an animation
	 * frame, which never runs while a render is in progress.
	 */
	let label = $state('');
	let at = $state({ x: 0, y: 0, below: false });
	let shown = $state(false);
	let bubble = $state<HTMLDivElement | null>(null);

	/** The element whose title we are holding, and the title we took. */
	let holding: Element | null = null;
	let held = '';
	/** What the bubble should be showing, or null for nothing. */
	let wanted: { text: string; owner: Element } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let frame = 0;

	/** Give the title back. Always safe to call. */
	function release() {
		if (holding && held) holding.setAttribute('title', held);
		holding = null;
		held = '';
	}

	/** Bring what is drawn into line with what is wanted, next frame. */
	function paint() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			if (!wanted) {
				shown = false;
				label = '';
				return;
			}
			label = wanted.text;
			shown = true;
			// And placed after the frame that gives it a size.
			const owner = wanted.owner;
			requestAnimationFrame(() => owner.isConnected && place(owner));
		});
	}

	function hide() {
		if (timer) clearTimeout(timer);
		timer = null;
		wanted = null;
		release();
		paint();
	}

	/**
	 * Where the bubble goes: above the thing, centred on it.
	 *
	 * Below instead when there is no room above — the top row of the app is a
	 * bar full of these — and pulled inside the window when centring would hang
	 * it off an edge. Measured after it is in the DOM, because the width
	 * depends on the words.
	 */
	function place(target: Element) {
		const box = target.getBoundingClientRect();
		const width = bubble?.offsetWidth ?? 0;
		const height = bubble?.offsetHeight ?? 0;
		const below = box.top - height - GAP < MARGIN;

		at = {
			x: Math.min(
				Math.max(box.left + box.width / 2 - width / 2, MARGIN),
				window.innerWidth - width - MARGIN
			),
			y: below ? box.bottom + GAP : box.top - height - GAP,
			below
		};
	}

	function consider(target: Element | null) {
		const owner = target?.closest?.('[title]') ?? null;
		if (!owner || owner === holding) return;

		const title = owner.getAttribute('title')?.trim() ?? '';
		if (!title || title.length > MAX_LENGTH) return;

		hide();
		holding = owner;
		held = title;
		// Off the element, so the browser has nothing of its own to draw.
		owner.removeAttribute('title');

		timer = setTimeout(() => {
			timer = null;
			if (holding !== owner || !owner.isConnected) return hide();
			wanted = { text: title, owner };
			paint();
		}, DELAY_MS);
	}

	onMount(() => {
		// A pointer that hovers, which a finger does not. The app is the same on
		// a phone; it simply never had these.
		if (!window.matchMedia('(pointer: fine)').matches) return;

		const over = (e: PointerEvent) => consider(e.target as Element | null);
		const out = (e: PointerEvent) => {
			const to = e.relatedTarget as Element | null;
			if (holding && to?.closest?.('[title]') === holding) return;
			hide();
		};
		// The keyboard's turn: a tooltip nobody can reach without a mouse is
		// half a tooltip.
		const focus = (e: FocusEvent) => consider(e.target as Element | null);
		const away = () => hide();
		const key = (e: KeyboardEvent) => {
			if (e.key === 'Escape') hide();
		};

		document.addEventListener('pointerover', over, true);
		document.addEventListener('pointerout', out, true);
		document.addEventListener('pointerdown', away, true);
		document.addEventListener('focusin', focus, true);
		document.addEventListener('focusout', away, true);
		document.addEventListener('keydown', key, true);
		// Anything that moves the element out from under the label takes the
		// label with it, rather than leaving it pointing at nothing.
		window.addEventListener('scroll', away, true);
		window.addEventListener('blur', away);
		window.addEventListener('resize', away);

		return () => {
			if (frame) cancelAnimationFrame(frame);
			hide();
			document.removeEventListener('pointerover', over, true);
			document.removeEventListener('pointerout', out, true);
			document.removeEventListener('pointerdown', away, true);
			document.removeEventListener('focusin', focus, true);
			document.removeEventListener('focusout', away, true);
			document.removeEventListener('keydown', key, true);
			window.removeEventListener('scroll', away, true);
			window.removeEventListener('blur', away);
			window.removeEventListener('resize', away);
		};
	});
</script>

{#if shown && label}
	<!-- `role="tooltip"` and nothing else: the element it describes still owns
	     its own accessible name, which is the `title` we gave back, or the
	     `aria-label` that was there all along. -->
	<div
		bind:this={bubble}
		class="tip {at.below ? 'is-below' : ''}"
		style="left: {at.x}px; top: {at.y}px"
		role="tooltip"
	>
		{label}
	</div>
{/if}

<style>
	.tip {
		position: fixed;
		z-index: 200;
		max-width: 20rem;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		background: var(--color-chrome);
		color: var(--color-chrome-ink);
		font-size: 0.75rem;
		line-height: 1.35;
		font-weight: 500;
		box-shadow: var(--shadow-overlay);
		pointer-events: none;
		white-space: nowrap;
		animation: tip-arrives 90ms ease-out both;
	}

	/* A long one wraps rather than running off the screen; a short one stays on
	   one line, which is nearly all of them. */
	@supports (width: min-content) {
		.tip {
			white-space: normal;
			width: max-content;
			max-width: min(20rem, calc(100vw - 2rem));
		}
	}

	@keyframes tip-arrives {
		from {
			opacity: 0;
			transform: translateY(2px);
		}
	}

	.tip.is-below {
		animation-name: tip-arrives-below;
	}

	@keyframes tip-arrives-below {
		from {
			opacity: 0;
			transform: translateY(-2px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tip {
			animation-duration: 1ms;
		}
	}
</style>
