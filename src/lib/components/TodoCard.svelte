<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import TickBox from '$lib/components/TickBox.svelte';
	import { pillStyle } from '$lib/pill-ink';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors';

	/**
	 * A todo drawn as a card: the board's columns and its to-do rail, and the
	 * plan's tray.
	 *
	 * A todo was drawn four ways — the list's row, the board's card, the
	 * board's rail card and the plan's tray card — with four ticks (or none),
	 * two title weights, and actions that were bare glyphs on one and missing
	 * on the next. This is the card, and it borrows the row's parts: the same
	 * `TickBox`, the title at the row's weight, and the actions as the row's
	 * `.icon-btn`s in a `.row-actions` group (held back until the pointer is on
	 * the card, 28px, room-specific verbs before edit, delete last).
	 *
	 *     tick | title                    actions
	 *          | meta (time, gauges, notebook, labels)
	 *          | children (what opens under it)
	 *
	 * It wears its category as its face (`.pill-soft`), which is what a card
	 * does; a row wears a `CategoryMark` instead. Everything else — drag,
	 * press, `aria-*` — goes on the card through the rest props.
	 */
	let {
		title,
		hint = undefined,
		color = null,
		done = false,
		doing = false,
		tickLabel = '',
		ontick = undefined,
		actions,
		meta,
		children,
		class: klass = '',
		...rest
	}: {
		title: string;
		/** The card's tooltip — its category's name, since the face is its colour. */
		hint?: string;
		/** The category's colour; none is the neutral card. */
		color?: string | null;
		done?: boolean;
		doing?: boolean;
		/** What pressing the tick does, in words. */
		tickLabel?: string;
		/** Without it there is no tick: the card is not something ticked here. */
		ontick?: () => void;
		actions?: Snippet;
		meta?: Snippet;
		children?: Snippet;
		class?: string;
	} & Omit<HTMLAttributes<HTMLElement>, 'title' | 'class' | 'children'> = $props();
</script>

<article
	{...rest}
	data-row
	title={hint}
	class="todo-card pill-soft shadow-card {klass}"
	style={pillStyle(color ?? CATEGORY_FALLBACK_COLOR)}
>
	<div class="flex items-start gap-2">
		{#if ontick}
			<button
				type="button"
				class="todo-card-tick -m-1 flex shrink-0 p-1 pointer-coarse:w-11 pointer-coarse:justify-center"
				title={tickLabel}
				aria-label={tickLabel}
				aria-pressed={done}
				onclick={(e) => {
					e.stopPropagation();
					ontick();
				}}
			>
				<TickBox {done} {doing} />
			</button>
		{/if}
		<div class="min-w-0 flex-1">
			<div class="flex items-start gap-2">
				<p class="todo-card-title min-w-0 flex-1 text-sm font-medium break-words">{title}</p>
				{#if actions}
					<div class="row-actions -my-0.5 flex shrink-0 items-center gap-0.5">
						{@render actions()}
					</div>
				{/if}
			</div>
			{#if meta}
				<div class="mt-0.5 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
					{@render meta()}
				</div>
			{/if}
		</div>
	</div>
	{@render children?.()}
</article>

<style>
	.todo-card {
		padding: 0.5rem 0.625rem;
	}

	/* The title is the tick's line: level with the middle of the box. */
	.todo-card-title {
		padding-top: 0.25rem;
		line-height: 1.25rem;
	}

	/* The actions are the row's buttons, and take the card's own ink so they
	   read on every colour a category can be. */
	.todo-card :global(.row-actions .icon-btn) {
		color: inherit;
	}
</style>
