<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { PANEL_WIDTH } from '$lib/services/settings';

	/**
	 * Two columns with a handle between them, and the handle is the divider.
	 *
	 * A panel of somebody's own names — locations, notebooks — is as wide as
	 * their longest name, and no default fits everybody: a fixed column turns
	 * half of them into an ellipsis and a wide one wastes the room the list
	 * beside it needs. So the width is theirs to set, it comes off the column
	 * beside it, and it is written down once — when they let go — rather than
	 * on every pixel of the drag.
	 *
	 * Below `lg` there are no columns at all: the panel sits above the list,
	 * where there is no width to take, and the handle is not drawn. A two-pixel
	 * target under a finger belongs to the page's scroll.
	 *
	 * Inventory had this and Notebooks wanted it, which is what made it a
	 * component rather than a second copy of the same twenty lines.
	 */
	let {
		/** The left column's width in rem, bound so the page can post it. */
		rem = $bindable(PANEL_WIDTH.fallback),
		/** What the handle is called, for whoever is not looking at it. */
		label,
		/**
		 * Called when the drag ends, with the width it ended at.
		 *
		 * Once, not per frame: this is a write to the account, and a drag across
		 * the screen is two hundred of them. After a `tick()`, because the
		 * callers post a hidden field bound to the same number — called any
		 * sooner it submits the value from before the last change, and the width
		 * that gets written down is one step behind the handle for ever.
		 */
		onsettle,
		/**
		 * Whether the columns are separate surfaces with space between them.
		 *
		 * Notebooks is two cards on the page's own ground; Inventory is one
		 * surface the divider runs down. The handle is drawn to match — a rule
		 * where there is a seam, an invisible grip where there is a gap.
		 */
		spaced = false,
		left,
		right
	}: {
		rem?: number;
		label: string;
		onsettle?: (rem: number) => void;
		spaced?: boolean;
		left: Snippet;
		right: Snippet;
	} = $props();

	let dragging = $state(false);

	function grab(event: PointerEvent) {
		const handle = event.currentTarget as HTMLElement;
		const column = handle.previousElementSibling;
		if (!column) return;

		const from = column.getBoundingClientRect().left;
		const oneRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

		dragging = true;
		handle.setPointerCapture(event.pointerId);

		const move = (e: PointerEvent) =>
			(rem = Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, (e.clientX - from) / oneRem)));
		const done = () => {
			dragging = false;
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', done);
			void settle();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', done);
	}

	/**
	 * The keyboard's version of the same drag.
	 *
	 * A handle that only answers to a pointer is a setting somebody on a
	 * keyboard cannot reach at all. Left and right move it a step; Home and End
	 * go to the ends.
	 */
	const STEP_REM = 1;

	function nudge(event: KeyboardEvent) {
		const to =
			event.key === 'ArrowLeft'
				? rem - STEP_REM
				: event.key === 'ArrowRight'
					? rem + STEP_REM
					: event.key === 'Home'
						? PANEL_WIDTH.min
						: event.key === 'End'
							? PANEL_WIDTH.max
							: null;
		if (to === null) return;
		event.preventDefault();
		rem = Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, to));
		void settle();
	}

	/** Let the new width reach the DOM before anybody reads it back out of one. */
	async function settle() {
		await tick();
		onsettle?.(rem);
	}
</script>

<div
	class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[var(--split-left)_auto_minmax(0,1fr)] {spaced
		? 'gap-4 lg:gap-0'
		: 'overflow-hidden'}"
	style="--split-left: {rem}rem"
>
	{@render left()}

	<!--
		A focusable separator is the window-splitter pattern: `separator` with a
		tabindex and a value is what carries "this divider can be moved, and it
		is here" to a screen reader. Svelte's rule reads `separator` as scenery.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="separator"
		aria-orientation="vertical"
		aria-label={label}
		aria-valuenow={Math.round(rem)}
		aria-valuemin={PANEL_WIDTH.min}
		aria-valuemax={PANEL_WIDTH.max}
		tabindex="0"
		class="split-handle mouse-only hidden cursor-col-resize touch-none lg:block {spaced
			? 'w-4'
			: 'is-seam w-2'} {dragging ? 'is-dragging' : ''}"
		onpointerdown={grab}
		onkeydown={nudge}
	></div>

	{@render right()}
</div>

<style>
	/* The grip: how thick the bar is and how tall. */
	.split-handle {
		--grip-thickness: 4px;
		--grip-height: 2.25rem;
	}

	/*
	 * The grip: one rounded bar.
	 *
	 * It was a two-pixel rule in `--color-gray-300`, which the dark theme turns
	 * into a wash — so on a dark ground the gap between the two cards was
	 * simply empty, and the only thing saying it could be dragged was a cursor
	 * you had to already be over it to see.
	 *
	 * Dots replaced it and were worse: a column of three-pixel circles drawn by
	 * a radial gradient whose stop is a hard edge, which at that size is not a
	 * circle at all — it is a stack of notches with corners on them. A bar has
	 * one outline, the browser rounds it properly, and it is the idiom anyway.
	 * `--color-gray-500` is a mid grey rather than a ramp end, so it reads
	 * against both grounds without being redefined per theme.
	 */
	.split-handle {
		position: relative;
		background-color: transparent;
		transition: background-color 120ms ease;
	}

	/*
	 * One seam, not two.
	 *
	 * Where the columns are a single surface the divider is a rule down the
	 * middle of it. It was `border-x` on the strip, which is two hairlines with
	 * a gap between them — a channel rather than a seam, and with the grip
	 * sitting between the two it read as a third line.
	 */
	.split-handle.is-seam::before {
		content: '';
		position: absolute;
		inset-block: 0;
		left: 50%;
		width: 1px;
		transform: translateX(-50%);
		background-color: var(--color-gray-200);
	}

	.split-handle::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: var(--grip-thickness);
		height: var(--grip-height);
		transform: translate(-50%, -50%);
		border-radius: calc(var(--grip-thickness) / 2);
		background-color: var(--color-gray-500);
		opacity: 0.6;
		transition: opacity 120ms ease;
	}

	.split-handle:hover::after,
	.split-handle:focus-visible::after,
	.split-handle.is-dragging::after {
		opacity: 1;
	}

	/* A wash under the whole strip while it is being held, so what you have hold
	   of is the strip and not only the bar on it. */
	.split-handle.is-dragging,
	.split-handle:hover {
		background-color: var(--hover-wash);
	}

	.split-handle:focus-visible {
		outline: 2px solid var(--control-on);
		outline-offset: -2px;
	}
</style>
