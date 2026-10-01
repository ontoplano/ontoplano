<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { BackCloses } from '$lib/back-closes';
	import Banner from '$lib/components/Banner.svelte';
	import { isPhone } from '$lib/breakpoints';
	import { panelHeight, readViewport } from '$lib/keyboard';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * A modal dialog.
	 *
	 * Forms used to open inline at the top of a page, pushing everything below
	 * them down: the list you were reading jumped, and on a phone the form and
	 * its subject could never be on screen together. A dialog leaves the page
	 * where it is.
	 *
	 * Built on `<dialog>` rather than a hand-rolled overlay, which buys the focus
	 * trap, Escape, the inert background and `::backdrop` from the platform.
	 * Below `sm` it becomes a sheet against the bottom of the screen, where a
	 * thumb is.
	 */
	/**
	 * How tall the sheet should be while the software keyboard is up.
	 *
	 * `height: 100dvh` is the layout viewport, and the keyboard covers that
	 * rather than shrinking it — so the footer of a full-height form, Save
	 * included, sat underneath the keyboard. `window.visualViewport` is the part
	 * actually on screen; `$lib/keyboard.ts` has the arithmetic and the reasons
	 * for its thresholds.
	 *
	 * Null the rest of the time, so nothing is written into the style attribute
	 * at all: a height pinned in pixels stops following a rotation.
	 */
	let keyboardHeight = $state<number | null>(null);

	$effect(() => {
		if (!open || typeof window === 'undefined' || !window.visualViewport) return;

		const viewport = window.visualViewport;
		const update = () => {
			const reading = readViewport();
			keyboardHeight = reading ? panelHeight(reading) : null;
		};

		update();
		viewport.addEventListener('resize', update);
		// iOS pushes the visible area down rather than only shrinking it, and
		// reports that as a scroll of the visual viewport.
		viewport.addEventListener('scroll', update);

		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
			keyboardHeight = null;
		};
	});

	let {
		open = $bindable(false),
		title,
		description = '',
		/** Widths are deliberately few: a form is one column or two, never five. */
		size = 'md',
		/**
		 * Where it sits on a wide screen.
		 *
		 * `side` docks it against the right edge with the page still legible
		 * beside it, for a form whose whole point is what it is doing to what is
		 * behind it — the planner's block form draws a preview on the grid, and
		 * a centred dialog covers the hours it is previewing. Below `lg` there
		 * is no room for both and it is the ordinary sheet.
		 */
		dock = 'centre',
		/** A failed submission's message. Shown here because the page behind is
		 *  dimmed and inert — an error rendered out there cannot be read. */
		error = null,
		onclose,
		/**
		 * Same moment, one beat later: after the history entry a phone screen
		 * holds has been given back. For a caller that navigates on close —
		 * a `goto` fired before the pop is simply undone by it.
		 */
		onclosed,
		/**
		 * What this is about, drawn at the far end of the header.
		 *
		 * For a form whose subject is chosen inside it: the block form says which
		 * thing and which category, where the title can only say "Edit block".
		 * Its own corner, so choosing something moves nothing in the form.
		 */
		badge,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		dock?: 'centre' | 'side';
		error?: string | null;
		onclose?: () => void;
		onclosed?: () => void;
		badge?: Snippet;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const WIDTHS = { sm: '28rem', md: '36rem', lg: '52rem' } as const;

	/*
	 * Wider, by hand, on a screen with room.
	 *
	 * Writing side by side in a 36rem dialog leaves each half a column wide,
	 * and a picture in the preview is a thumbnail. Either side edge drags: the
	 * dialog is centred, so both edges move together, at the same rate. A
	 * double-click on an edge puts it back. Kept while the page is, so the
	 * form opens as wide as it was left.
	 */
	/** Pixels kept clear between a widened dialog and the window's edges. */
	const WIDEN_GUTTER = 32;
	let widened = $state(0);
	let widening: { x: number; from: number; side: 1 | -1 } | null = null;

	function widenDown(event: PointerEvent, side: 1 | -1) {
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		widening = { x: event.clientX, from: widened, side };
	}

	function widenMove(event: PointerEvent) {
		if (!widening || !dialog) return;
		const base = dialog.getBoundingClientRect().width - widened;
		const room = Math.max(0, window.innerWidth - WIDEN_GUTTER * 2 - base);
		const moved = (event.clientX - widening.x) * widening.side * 2;
		widened = Math.min(room, Math.max(0, widening.from + moved));
	}

	function widenUp() {
		widening = null;
	}

	let dialog: HTMLDialogElement | undefined = $state();

	/**
	 * The sheet gesture, below `sm`.
	 *
	 * A phone dialog that can only be dismissed by finding an × is a web page;
	 * dragging it down and letting go is what makes it a sheet. Down follows
	 * the finger one-for-one; up is damped, so pulling against the top gives
	 * the elastic give of a native sheet instead of a wall. Only the handle
	 * drags — the content underneath keeps its own scrolling.
	 */
	let dragY = $state(0);
	let draggingSheet = $state(false);
	let dragStartY = 0;
	let dragStartAt = 0;

	function sheetDown(e: PointerEvent) {
		// Not when the gesture starts on a control. The header doubles as the
		// drag handle, and capturing the pointer here swallowed the tap on the
		// back arrow sitting inside it — the button was drawn, and did nothing.
		if ((e.target as Element | null)?.closest('button')) return;
		draggingSheet = true;
		dragStartY = e.clientY;
		dragStartAt = performance.now();
		dragY = 0;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function sheetMove(e: PointerEvent) {
		if (!draggingSheet) return;
		const dy = e.clientY - dragStartY;
		dragY = dy > 0 ? dy : -Math.pow(-dy, 0.6);
	}

	function sheetUp() {
		if (!draggingSheet) return;
		draggingSheet = false;
		// Far enough, or flung: closed. Anything less springs back.
		const speed = dragY / Math.max(1, performance.now() - dragStartAt);
		if (dragY > 96 || speed > 0.55) handleClose();
		dragY = 0;
	}

	// `showModal()` is what makes it modal; setting the `open` attribute alone
	// gives a non-modal dialog with no backdrop and no focus trap.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			focusFirstField();
		}
		if (!open && dialog.open) dialog.close();
	});

	/**
	 * `showModal()` puts focus on the dialog itself, which undoes any autofocus
	 * inside it — so the first field is focused after the fact.
	 */
	async function focusFirstField() {
		await tick();
		const field = dialog?.querySelector<HTMLElement>(
			'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
		);
		// `preventScroll`, because this element is inside the box the app
		// scrolls and focusing it otherwise drags that box to the top.
		field?.focus({ preventScroll: true });
	}

	/**
	 * On a phone this is a screen, and a screen answers the system back
	 * gesture: while it is open it holds a history entry, so Android's back
	 * button closes the form instead of leaving the app. Closing it any other
	 * way — the arrow, Escape, a saved form — takes the entry back out.
	 */
	const back = new BackCloses(() => handleClose());

	$effect(() => {
		if (open && isPhone()) back.claim();
	});

	$effect(() => back.watch());

	/*
	 * Stepped away while its form is being answered.
	 *
	 * Saving from the footer used to hold the dialog on screen for the whole
	 * round trip — a second or two of a form that had plainly been sent. Now
	 * `$lib/enhance` asks it to step away the moment the press is made: the
	 * `<dialog>` closes, so the page behind is live again, but `open` stays
	 * true and everything typed stays mounted. When the answer comes, it comes
	 * back if the page still wants it — a refused save, with the reason in the
	 * error banner — and otherwise the page has already closed it and there is
	 * nothing to undo.
	 */
	let away = false;

	function stepAway() {
		if (!dialog?.open) return;
		away = true;
		dialog.close();
	}

	/**
	 * The answer is in: back on screen if the page still wants it, and closed
	 * properly if the page has let it go. Reached from the answer and from the
	 * page closing it, whichever comes first.
	 */
	function stepBack() {
		if (!away) return;
		away = false;
		if (open) {
			if (dialog && !dialog.open) dialog.showModal();
			return;
		}
		onclose?.();
		void back.release().then(() => onclosed?.());
	}

	$effect(() => {
		if (!dialog) return;
		const el = dialog;
		el.addEventListener('stepaway', stepAway);
		el.addEventListener('stepback', stepBack);
		return () => {
			el.removeEventListener('stepaway', stepAway);
			el.removeEventListener('stepback', stepBack);
		};
	});

	// Closed by the page while away: what the native close would have done.
	$effect(() => {
		if (!open) stepBack();
	});

	/** The `close` event that stepping away fires — later, as a task — is not somebody closing it. */
	function handleNativeClose() {
		if (!away) handleClose();
	}

	function handleClose() {
		away = false;
		open = false;
		onclose?.();
		// `onclosed` waits for the history entry to be given back, because a
		// caller that navigates on close would otherwise be undone by the pop.
		void back.release().then(() => onclosed?.());
	}

	/**
	 * Clicking the backdrop closes — pressing it and letting go there, both.
	 *
	 * The backdrop is not a child element, so a press or a click on it lands on
	 * the dialog itself; anything inside stops at the panel below.
	 *
	 * The press is half of it because a click is the *end* of a gesture, and the
	 * gesture may have begun somewhere this dialog did not exist. Tapping the
	 * fan's notifications petal is exactly that: the release chooses the petal,
	 * the dialog opens under the finger, and the click that follows a quarter of
	 * a second later lands on the backdrop that has just appeared — so the list
	 * opened and shut inside one tap, and the only way in was to drag onto the
	 * petal and let go, a gesture that ends in no click at all.
	 *
	 * It is also the right rule for the ordinary case it was already getting
	 * wrong: selecting text inside the panel and releasing outside it is not a
	 * request to throw the form away.
	 */
	let pressedOnBackdrop = false;

	function handlePointerDown(event: PointerEvent) {
		pressedOnBackdrop = event.target === dialog;
	}

	function handleClick(event: MouseEvent) {
		if (event.target === dialog && pressedOnBackdrop) handleClose();
		pressedOnBackdrop = false;
	}
</script>

<dialog
	bind:this={dialog}
	onclose={handleNativeClose}
	onpointerdown={handlePointerDown}
	onclick={handleClick}
	aria-label={title}
	class:docked={dock === 'side'}
	style="--modal-width: calc({WIDTHS[size]} + {widened}px)"
>
	{#if open}
		<div
			class="rise panel border border-gray-200 bg-white shadow-overlay"
			class:snapping={!draggingSheet}
			style="transform: translateY({Math.round(dragY)}px); {keyboardHeight
				? `height:${keyboardHeight}px; max-height:${keyboardHeight}px`
				: ''}"
		>
			<!--
				The phone header: a back arrow and the title, the way a screen in an
				app is headed. It doubles as the drag handle, so the sheet gesture
				still dismisses the short ones.
			-->
			<header
				class="flex items-center gap-2 border-b border-gray-200 px-3 py-3 sm:hidden"
				style="touch-action: none"
				onpointerdown={sheetDown}
				onpointermove={sheetMove}
				onpointerup={sheetUp}
				onpointercancel={sheetUp}
			>
				<button
					type="button"
					onclick={handleClose}
					aria-label={t('ui.back')}
					class="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center text-gray-700"
				>
					<svg
						class="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="square"
						aria-hidden="true"
					>
						<path d="M15 5l-7 7 7 7" />
					</svg>
				</button>
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-base font-semibold text-gray-900">{title}</h2>
					{#if description}
						<p class="truncate text-xs text-gray-500">{description}</p>
					{/if}
				</div>
				{#if badge}
					<div class="min-w-0 shrink-0 text-right">{@render badge()}</div>
				{/if}
			</header>

			<header
				class="hidden items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 sm:flex"
			>
				<div class="min-w-0">
					<h2 class="text-sm font-semibold text-gray-900">{title}</h2>
					{#if description}
						<p class="mt-0.5 text-sm text-gray-500">{description}</p>
					{/if}
				</div>
				{#if badge}
					<div class="ml-auto min-w-0 text-right">{@render badge()}</div>
				{/if}
				<button
					type="button"
					onclick={handleClose}
					aria-label={t('ui.close')}
					class="btn btn-quiet btn-sm -mt-1 -mr-2"
				>
					&times;
				</button>
			</header>

			{#if dock === 'centre'}
				{#each [-1, 1] as const as side (side)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="widen-edge {side < 0 ? 'left' : 'right'}"
						title={t('modal.dragToWiden')}
						onpointerdown={(event) => widenDown(event, side)}
						onpointermove={widenMove}
						onpointerup={widenUp}
						onpointercancel={widenUp}
						ondblclick={() => (widened = 0)}
					></div>
				{/each}
			{/if}

			<div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5">
				{#if error}
					<div class="mb-4"><Banner kind="error" message={error} /></div>
				{/if}
				{@render children()}
			</div>

			{#if footer}
				<footer
					data-modal-footer
					class="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3"
					style="padding-bottom: calc(0.75rem + var(--safe-bottom, 0px))"
				>
					{@render footer()}
				</footer>
			{/if}
		</div>
	{/if}
</dialog>

<style>
	/*
	 * Geometry lives here rather than in utility classes: a `<dialog>` is a
	 * top-layer element with its own default margins and width, and unlayered
	 * rules like these are what reliably override them.
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
		overflow: visible;
	}

	dialog::backdrop {
		background: rgb(17 24 39 / 0.45);
	}

	/*
	 * The phone: the whole screen, edge to edge, no floating card. The safe area
	 * at the top is the notch; without it the back arrow sits under the clock.
	 */
	.panel {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		padding-top: var(--safe-top, 0px);
	}

	/* The edges that widen it: only with a mouse, and only where it floats. */
	.widen-edge {
		display: none;
	}

	@media (min-width: 640px) and (pointer: fine) {
		.panel {
			position: relative;
		}

		.widen-edge {
			position: absolute;
			top: 0;
			bottom: 0;
			z-index: 1;
			display: block;
			width: 0.5rem;
			cursor: ew-resize;
			touch-action: none;
			transition: background-color 120ms ease;
		}

		/* Inside the panel: the dialog clips anything past it, and a press that
		   misses the edge lands on the dialog, which is the backdrop and closes. */
		.widen-edge.left {
			left: 0;
		}

		.widen-edge.right {
			right: 0;
		}

		.widen-edge:hover {
			background-color: color-mix(in srgb, var(--color-gray-400) 35%, transparent);
		}
	}

	/* The spring back after a drag that was not far enough to close. */
	.panel.snapping {
		transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
	}

	@media (max-width: 639px) {
		/* Arrive the way a sheet does — from below, not fading in place. */
		.panel {
			animation: sheet-in 240ms cubic-bezier(0.2, 0.9, 0.3, 1);
		}
	}

	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
	}

	/*
	 * Anywhere wider, a card below the site header with room around it.
	 *
	 * The dialog is fixed with all four insets at zero, so `height: auto`
	 * stretches it to the whole window rather than shrinking it to the card —
	 * and the card sat in its top-left corner, at y=0, over the header, with
	 * its top corners cut off by the edge. The dialog is the full-height
	 * layer (its empty part is the backdrop that closes it), and the card
	 * hangs from a fixed distance below the top: fixed rather than centred, so
	 * a form that grows — More options opening — grows downwards and nothing
	 * already on it moves.
	 */
	@media (min-width: 640px) {
		dialog {
			--modal-top: clamp(4.5rem, 10dvh, 7rem);
			--modal-foot: 2rem;
			inset: 0;
			margin: 0 auto;
			width: min(100% - 2rem, var(--modal-width));
			height: 100dvh;
			padding-top: var(--modal-top);
		}

		dialog[open] {
			display: flex;
			flex-direction: column;
		}

		.panel {
			height: auto;
			max-height: calc(100dvh - var(--modal-top) - var(--modal-foot));
			border-width: 1px;
			padding-top: 0;
		}
	}

	/*
	 * Docked: against the right edge, full height, with the page beside it.
	 *
	 * Only where there is room for both. The dimming goes down with it — the
	 * point of docking is that what is behind can be read, and 45% grey over a
	 * calendar is not reading.
	 */
	@media (min-width: 1024px) {
		dialog.docked {
			inset: 0 0 0 auto;
			margin: 0;
			height: 100dvh;
			width: min(100% - 2rem, var(--modal-width));
			padding-top: 0;
		}

		dialog.docked::backdrop {
			background: rgb(17 24 39 / 0.12);
		}

		dialog.docked .panel {
			height: 100dvh;
			max-height: 100dvh;
			border-width: 0 0 0 1px;
		}
	}
</style>
