<script lang="ts">
	/**
	 * The card a task reference shows while it is rested on — see
	 * `$lib/task-peek`. Read-only: no tick, no buttons, nothing to press.
	 *
	 * A popover, so it lies in the top layer over an open dialog or a notebook
	 * on the whole screen, which is where most references are read.
	 */
	import { peek } from '$lib/task-peek.svelte';
	import TickBox from '$lib/components/TickBox.svelte';
	import Written from '$lib/components/Written.svelte';
	import { civilOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { CLOSED_STATUSES } from '$lib/task-status';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** Off the reference, and clear of the window's edges. */
	const GAP = 6;
	const MARGIN = 8;
	/** At most this many lines of its notes. */
	const NOTE_LINES = 4;

	let card = $state<HTMLDivElement>();
	let at = $state({ x: 0, y: 0 });

	$effect(() => {
		if (!card) return;
		if (!peek.task || !peek.rect) {
			if (card.matches(':popover-open')) card.hidePopover();
			return;
		}
		if (!card.matches(':popover-open')) card.showPopover();
		const rect = peek.rect;
		const box = card.getBoundingClientRect();
		const below = rect.bottom + GAP + box.height + MARGIN <= innerHeight;
		at = {
			x: Math.min(Math.max(MARGIN, rect.left), innerWidth - box.width - MARGIN),
			y: below ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - box.height)
		};
	});

	const done = $derived(peek.task ? CLOSED_STATUSES.includes(peek.task.status as never) : false);
</script>

<div
	bind:this={card}
	popover="manual"
	class="task-peek border border-gray-200 bg-white p-3 text-left shadow-overlay"
	style="left: {at.x}px; top: {at.y}px"
	role="tooltip"
>
	{#if peek.task}
		{@const task = peek.task}
		<div class="flex items-start gap-2">
			<TickBox {done} doing={task.status === 'doing'} />
			<div class="min-w-0 flex-1">
				<p
					class="text-sm font-medium break-words {done
						? 'text-gray-500 line-through'
						: 'text-gray-900'}"
				>
					{task.title}
				</p>
				<p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-600">
					{#if task.scheduledDate}<span>{civilOf(task.scheduledDate, now())}</span>{/if}
					{#if task.notebookTitle}<span>{task.notebookTitle}</span>{/if}
					{#if task.archivedAt}<span>{t('todoRows.archived')}</span>{/if}
				</p>
			</div>
		</div>
		{#if task.notes}
			<div class="mt-2">
				<Written content={task.notes} compact lines={NOTE_LINES} />
			</div>
		{/if}
		{#if task.categoryName}
			<span
				class="pill mt-2 inline-block"
				style="--pill: {task.categoryColor ?? 'var(--color-gray-400)'}">{task.categoryName}</span
			>
		{/if}
	{/if}
</div>

<style>
	.task-peek {
		position: fixed;
		margin: 0;
		width: min(22rem, calc(100vw - 1rem));
		pointer-events: none;
		inset: auto;
	}
</style>
