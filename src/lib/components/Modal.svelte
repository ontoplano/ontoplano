<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import Banner from '$lib/components/Banner.svelte';

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
	let {
		open = $bindable(false),
		title,
		description = '',
		/** Widths are deliberately few: a form is one column or two, never five. */
		size = 'md',
		/** A failed submission's message. Shown here because the page behind is
		 *  dimmed and inert — an error rendered out there cannot be read. */
		error = null,
		onclose,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		error?: string | null;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const WIDTHS = { sm: '28rem', md: '36rem', lg: '52rem' } as const;

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
		field?.focus();
	}

	function handleClose() {
		open = false;
		onclose?.();
	}

	/**
	 * Clicking the backdrop closes.
	 *
	 * The backdrop is not a child element, so a click on it lands on the dialog
	 * itself; anything inside stops at the panel below.
	 */
	function handleClick(event: MouseEvent) {
		if (event.target === dialog) handleClose();
	}
</script>

<dialog
	bind:this={dialog}
	onclose={handleClose}
	onclick={handleClick}
	aria-label={title}
	style="--modal-width: {WIDTHS[size]}"
>
	{#if open}
		<div
			class="rise panel border border-gray-200 bg-white shadow-overlay"
			class:snapping={!draggingSheet}
			style="transform: translateY({Math.round(dragY)}px)"
		>
			<div
				class="sheet-handle sm:hidden"
				style="touch-action: none"
				onpointerdown={sheetDown}
				onpointermove={sheetMove}
				onpointerup={sheetUp}
				onpointercancel={sheetUp}
			>
				<div class="mx-auto h-1 w-10 bg-gray-300"></div>
			</div>
			<header class="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
				<div>
					<h2 class="text-sm font-semibold text-gray-900">{title}</h2>
					{#if description}
						<p class="mt-0.5 text-sm text-gray-500">{description}</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={handleClose}
					aria-label="Close"
					class="btn btn-quiet btn-sm -mt-1 -mr-2"
				>
					&times;
				</button>
			</header>

			<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				{#if error}
					<div class="mb-4"><Banner kind="error" message={error} /></div>
				{/if}
				{@render children()}
			</div>

			{#if footer}
				<footer
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
		inset: auto 0 0 0;
		width: 100%;
		max-width: 100%;
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

	.panel {
		display: flex;
		flex-direction: column;
		max-height: 100dvh;
	}

	/* The spring back after a drag that was not far enough to close. */
	.panel.snapping {
		transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
	}

	.sheet-handle {
		padding: 0.625rem 0 0.375rem;
		cursor: grab;
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

	@media (min-width: 640px) {
		dialog {
			inset: 0;
			margin: auto;
			width: min(100% - 2rem, var(--modal-width));
		}

		.panel {
			max-height: 85dvh;
		}
	}
</style>
