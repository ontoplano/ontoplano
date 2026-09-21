<script lang="ts">
	/**
	 * The controls that narrow a list, folded until they are wanted.
	 *
	 * Every room grew its own answer to the same problem and they disagreed:
	 * the task list put seven controls in a row that needed three lines on a
	 * phone, Inventory opened its four in a modal, Finance put four pickers in
	 * a toolbar. Same object, three shapes.
	 *
	 * **Not a modal, deliberately.** Filtering is a loop — narrow, look,
	 * adjust — and a sheet over the list breaks it: you choose blind, close,
	 * look, and open it again. It also needs an Apply, which is a second
	 * decision about something that should be instant. Folded open in place,
	 * the list is still underneath and every press is answered by it. That is
	 * the same reason Inventory's modal had to grow a line above it saying
	 * what the filters were keeping off the screen.
	 *
	 * The risk of folding anything away is that a filter somebody cannot see
	 * is a filter they forget is on, so this never hides that: the button
	 * names what is narrowing the list while it is shut, and a way to clear it
	 * stands beside it. `on` without a `summary` is a bug in the caller, not a
	 * style choice.
	 *
	 * What stays out is what you do not press: the search box (`lead`) is
	 * typed into and the count and the order (`trailing`) are read, so both
	 * are always there.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	const t = useT();

	let {
		/** Distinguishes this one's ids from another on the same page. */
		name,
		/** Whether anything is narrowing the list right now. */
		on = false,
		/**
		 * What is narrowing it, in the reader's words — "#home, #reading".
		 *
		 * Shown on the button while it is shut, because the whole point of
		 * folding is that nothing is lost by it.
		 */
		summary = '',
		onclear,
		lead,
		trailing,
		children
	}: {
		name: string;
		on?: boolean;
		summary?: string;
		onclear?: () => void;
		lead?: Snippet;
		trailing?: Snippet;
		children: Snippet;
	} = $props();

	/*
	 * Open if something is already narrowing the list.
	 *
	 * Arriving at a list that is showing four of forty rows with the reason
	 * folded away is the "forgot it was on" failure in its worst form — the
	 * filter came from somewhere else, so there is not even a press to
	 * remember. Read once: from there it is the reader's to open and shut.
	 */
	// svelte-ignore state_referenced_locally
	let open = $state(on);

	/** How much of the summary fits on a button before it is a sentence. */
	const SUMMARY_CHARS = 28;
	const said = $derived(
		!on ? t('filters.filters') : summary.length > SUMMARY_CHARS ? t('filters.filtersOn') : summary
	);
</script>

<div class="flex flex-wrap items-center gap-2">
	{#if lead}{@render lead()}{/if}

	<button
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls="{name}-filters"
		aria-pressed={on}
		class="btn btn-sm btn-quiet shrink-0"
		title={on && summary ? summary : t('filters.narrowThisList')}
	>
		<Icon name="filter" size={14} />
		<span class="truncate">{said}</span>
	</button>

	<!--
		The way back to everything, beside the thing that took it away.

		Drawn always and made invisible while there is nothing to clear, so
		switching a filter on does not move the controls beside it.
	-->
	{#if onclear}
		<button
			type="button"
			onclick={onclear}
			class="btn btn-sm btn-quiet shrink-0 {on ? '' : 'invisible'}"
			aria-hidden={!on}
			tabindex={on ? 0 : -1}
		>
			{t('filters.clear')}
		</button>
	{/if}

	{#if trailing}{@render trailing()}{/if}
</div>

{#if open}
	<div
		id="{name}-filters"
		class="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-2"
	>
		{@render children()}
	</div>
{/if}
