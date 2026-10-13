<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Written from '$lib/components/Written.svelte';
	import type { TodoRefs } from '$lib/markdown';

	/**
	 * A row's notes: one line until somebody asks for the rest.
	 *
	 * Written for a task's row and taken out of it when a thing in the
	 * inventory needed the same — its notes were the whole paragraph at full
	 * length beside the name, a link of three hundred characters included,
	 * while a task's folded to its first line. One component so the two rows
	 * fold the same way and answer the same presses.
	 *
	 * The chevron sits on the first line of the writing, and that line is what
	 * folds it.
	 *
	 * Open, the press is the first line and the mark beside it — nothing else.
	 * Everything under it is a paragraph somebody is reading, and reading means
	 * selecting a word or following a link, both of which used to fold the row
	 * away mid-sentence. Which line was pressed is worked out from where the
	 * pointer was rather than from an overlay, so the words stay selectable and
	 * a link in them stays a link.
	 *
	 * Folded, the whole block opens: the line, a picture in it, any of it.
	 * There is nothing to lose by pressing in the wrong place when the only
	 * thing that can happen is seeing more.
	 *
	 * A picture or a recording is still its own control — the press is caught
	 * here rather than bound to the block, so playing something does not fold
	 * the row. Open or not is per row and per visit: a way of looking at a
	 * list, not a fact about the list.
	 */
	let {
		content,
		/** What the chevron is announced as: the row's own name. */
		label,
		/** What `TASK:#4` in the writing resolves against, where the row knows. */
		todos = undefined
	}: { content: string; label: string; todos?: TodoRefs } = $props();

	let open = $state(false);

	/**
	 * Whether the folded line is showing less than it holds.
	 *
	 * Measured rather than counted — see `$lib/actions/overflows`. Opening the
	 * row takes the clamp off, so the element stops overflowing and says so;
	 * that is not "there was never anything folded", and acting on it would
	 * take away the chevron that shuts it again.
	 */
	let truncated = $state(false);

	function ontruncate(over: boolean) {
		if (!open) truncated = over;
	}

	/**
	 * Whether there is anything to unfold. Not "are there notes": a one-line
	 * note with a chevron swapped one line of text for the same line.
	 */
	const hasMore = $derived(truncated || open);

	/** If a browser answers `normal` for the line height, a line is about this. */
	const FALLBACK_LINE = 20;

	/** Whether a press where this pointer is would fold or unfold the writing. */
	function folds(at: MouseEvent): boolean {
		if (!hasMore) return false;

		const target = at.target as HTMLElement;
		if (target.closest('a, button, audio, input, textarea')) return false;
		if (!open) return true;

		const block = at.currentTarget as HTMLElement;
		const box = block.getBoundingClientRect();
		const line = parseFloat(getComputedStyle(block).lineHeight);
		return at.clientY - box.top <= (Number.isFinite(line) ? line : FALLBACK_LINE);
	}

	/*
	 * The pointer says so before the press does: a class on the block rather
	 * than state, since it changes on every pixel of movement, asked with the
	 * same test the press uses so the two cannot disagree.
	 */
	function hover(move: PointerEvent) {
		(move.currentTarget as HTMLElement).classList.toggle('folding-notes-hot', folds(move));
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="folding-notes {hasMore ? 'folding-notes-foldable' : ''}"
	onclick={(press) => {
		if (folds(press)) open = !open;
	}}
	onpointermove={hover}
	onpointerleave={(leave) =>
		(leave.currentTarget as HTMLElement).classList.remove('folding-notes-hot')}
>
	{#if hasMore}
		<button
			type="button"
			class="folding-notes-mark"
			onclick={(press) => {
				press.stopPropagation();
				open = !open;
			}}
			aria-expanded={open}
			aria-label={label}
		>
			<Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
		</button>
	{/if}
	<Written {content} compact oneLine={!open} {ontruncate} {todos} />
</div>
