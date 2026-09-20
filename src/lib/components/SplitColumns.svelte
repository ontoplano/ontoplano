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
			: 'w-2 border-x border-gray-200'} {dragging ? 'is-dragging' : ''}"
		onpointerdown={grab}
		onkeydown={nudge}
	></div>

	{@render right()}
</div>

<style>
	/*
	 * The grip: a rule down the middle of the handle rather than a filled
	 * strip, so it reads as something to take hold of in both arrangements —
	 * against a seam, and in the gap between two cards where there is no seam
	 * to thicken.
	 */
	.split-handle {
		position: relative;
		background-color: transparent;
		transition: background-color 120ms ease;
	}

	.split-handle::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 2px;
		height: 2.5rem;
		transform: translate(-50%, -50%);
		background-color: var(--color-gray-300);
		transition: background-color 120ms ease;
	}

	.split-handle:hover::after,
	.split-handle:focus-visible::after,
	.split-handle.is-dragging::after {
		background-color: var(--color-gray-500);
	}

	.split-handle:focus-visible {
		outline: 2px solid var(--control-on);
		outline-offset: -2px;
	}
</style>
