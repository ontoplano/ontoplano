<script lang="ts">
	/**
	 * A change made in place, held beside the thing until it is confirmed.
	 *
	 * Some changes are quick enough to make without opening anything — a
	 * label taken off, a rating moved — and too easy to make by accident to
	 * apply on the press. So the press opens this next to what was pressed: a
	 * × in the corner that throws the change away, whatever the change wants
	 * to show of itself, and one button that makes it so.
	 *
	 * It floats in the browser's top layer (`popover`), so it costs the layout
	 * nothing and nothing it opens over moves. Escape and a press anywhere
	 * else are the same as the ×: nothing happened.
	 */
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { useT } from '$lib/i18n';

	/** Space kept between the box and the thing it is about, and the screen's edge. */
	const GAP_PX = 6;
	const EDGE_PX = 8;

	let {
		/** What the change is about; the box opens beside it. */
		anchor,
		/** The ×, Escape, or a press elsewhere: undo whatever was changed. */
		onundo,
		/** The words on the button that makes it so. */
		confirm,
		/** Called by the button, unless the box holds a form that submits instead. */
		onconfirm = undefined,
		/** A form's id, when the button should submit it rather than call `onconfirm`. */
		form = undefined,
		/** Whatever the change shows of itself above the button. */
		children = undefined,
		/** Anything that belongs in the top row, left of the ×. */
		corner = undefined
	}: {
		anchor: HTMLElement;
		onundo: () => void;
		confirm: string;
		onconfirm?: () => void;
		form?: string;
		children?: Snippet;
		corner?: Snippet;
	} = $props();

	const t = useT();

	let box = $state<HTMLElement | null>(null);
	let where = $state({ left: 0, top: 0 });

	/*
	 * Beside it where there is room, under it where there is not — and on the
	 * screen either way. Measured each time, because a popover is not on the
	 * page and does not move with it.
	 */
	function place() {
		if (!box) return;
		const at = anchor.getBoundingClientRect();
		const wide = box.offsetWidth;
		const high = box.offsetHeight;
		const across = window.innerWidth;
		const down = window.innerHeight;
		let left = at.right + GAP_PX;
		let top = at.top;
		if (left + wide > across - EDGE_PX) {
			left = at.left;
			top = at.bottom + GAP_PX;
		}
		left = Math.max(EDGE_PX, Math.min(left, across - EDGE_PX - wide));
		if (top + high > down - EDGE_PX) top = Math.max(EDGE_PX, at.top - GAP_PX - high);
		where = { left, top };
	}

	$effect(() => {
		if (!box) return;
		try {
			box.showPopover?.();
		} catch {
			/* already open, or a browser without popovers: it still draws */
		}
		place();

		const follow = () => place();
		const away = (event: PointerEvent) => {
			const target = event.target as Node;
			if (box?.contains(target) || anchor.contains(target)) return;
			onundo();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			onundo();
		};
		window.addEventListener('scroll', follow, true);
		window.addEventListener('resize', follow);
		window.addEventListener('pointerdown', away, true);
		window.addEventListener('keydown', key);
		return () => {
			window.removeEventListener('scroll', follow, true);
			window.removeEventListener('resize', follow);
			window.removeEventListener('pointerdown', away, true);
			window.removeEventListener('keydown', key);
			try {
				box?.hidePopover?.();
			} catch {
				/* already closed */
			}
		};
	});
</script>

<div
	bind:this={box}
	popover="manual"
	role="dialog"
	aria-label={confirm}
	style="left:{where.left}px; top:{where.top}px"
	class="overlay-face rise fixed m-0 w-max border p-2 pt-1 shadow-overlay"
>
	<div class="flex justify-end">
		{@render corner?.()}
		<button
			type="button"
			class="icon-btn"
			onclick={onundo}
			title={t('ui.cancel')}
			aria-label={t('ui.cancel')}
		>
			<Icon name="close" size={12} />
		</button>
	</div>
	{#if children}
		<div class="mb-2">{@render children()}</div>
	{/if}
	<button
		type={form ? 'submit' : 'button'}
		{form}
		class="btn btn-primary btn-sm w-full"
		use:armed
		onclick={form ? undefined : onconfirm}
	>
		{confirm}
	</button>
</div>
