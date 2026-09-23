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
	 * is a filter they forget is on, so this never hides that: the strip opens
	 * itself when something is narrowing the list, the button says so while it
	 * is shut, and a way to clear it stands beside it. `on` without a
	 * `summary` is a bug in the caller, not a style choice.
	 *
	 * **The space is reserved whether or not they are showing.** They used to
	 * appear on a row that was not there a moment ago, so pressing the button
	 * made the whole strip taller and pushed the list down — and they landed
	 * under the sort order, which is not what opened them. The slot is always
	 * in the row now, between the count and the sort; what changes is whether
	 * the controls in it are visible. Nothing moves, and the sort stays where
	 * the eye left it.
	 *
	 * One row, in one order, on every screen:
	 *
	 *     search   filter   count   [ the filters ]   ——   sort   direction
	 *
	 * What stays out is what you do not press: the search box (`lead`) is
	 * typed into, and the count and the order are read.
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
		count,
		trailing,
		children
	}: {
		name: string;
		on?: boolean;
		summary?: string;
		onclear?: () => void;
		lead?: Snippet;
		/**
		 * How many rows are showing, read rather than pressed.
		 *
		 * Beside the button that narrows the list, because it is the answer to
		 * what that button just did. It rode along with the sort order before,
		 * at the far end of the strip from the thing that changed it.
		 */
		count?: Snippet;
		/** The sort order and its direction, at the far end. */
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

	/*
	 * What the button says it is doing, for whoever is not looking at it.
	 *
	 * The word "Filters" is off the button — it is an icon in a row of
	 * controls that are all icons or numbers, and the word was the widest
	 * thing in the strip on a phone. It is still the accessible name, and the
	 * summary replaces it whenever something is actually narrowing the list,
	 * so a filter left on says so on hover and to a screen reader.
	 */
	const said = $derived(on && summary ? summary : t('filters.filters'));
</script>

<div class="flex w-full flex-wrap items-center gap-2">
	{#if lead}{@render lead()}{/if}

	<!-- An icon, and a dot on it when something is on: the word was the widest
	     thing in the strip and said nothing the icon does not. -->
	<button
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls="{name}-filters"
		aria-pressed={on}
		class="filter-toggle btn btn-sm btn-quiet shrink-0"
		title={said}
		aria-label={said}
	>
		<Icon name="filter" size={14} />
		{#if on}<span class="filter-dot" aria-hidden="true"></span>{/if}
	</button>

	<!--
		The way back to everything, beside the thing that took it away.

		Outside the slot, deliberately: a filter that is on while the strip is
		folded away is the "forgot it was on" case this component exists to
		prevent, and a Clear folded away with it would be the way back hidden
		behind the thing you cannot see. Drawn always and made invisible while
		there is nothing to clear, so switching a filter on moves nothing.
	-->
	{#if onclear}
		<button
			type="button"
			onclick={onclear}
			class="btn btn-sm btn-quiet shrink-0 {on ? '' : 'invisible'}"
			inert={!on}
		>
			{t('filters.clear')}
		</button>
	{/if}

	{#if count}{@render count()}{/if}

	<!--
		The filters themselves, in a slot that is always here.

		`invisible` rather than unmounted: the strip keeps its height and the
		sort order at the far end keeps its place, so pressing the button
		changes what you can see and never where anything is. `inert` takes the
		hidden controls out of the tab order and off the accessibility tree,
		which `invisible` alone does not.

		Its own rows on a phone, where the order above cannot fit across 390px:
		the search takes the first line, the button, the count and the order the
		second, and the filters lay out under them rather than wrapping through
		the middle of the strip. The one line is what happens where there is
		room for one line.
	-->
	<div
		id="{name}-filters"
		class="order-last flex min-w-0 basis-full flex-wrap items-center gap-2 sm:order-none sm:flex-1 sm:basis-auto {open
			? ''
			: 'invisible'}"
		inert={!open}
	>
		{@render children()}
	</div>

	{#if trailing}
		<div class="ml-auto flex shrink-0 items-center gap-2">{@render trailing()}</div>
	{/if}
</div>

<style>
	/* The mark that says a filter is on while the strip is shut. */
	.filter-toggle {
		position: relative;
	}

	.filter-dot {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background-color: var(--control-on);
	}
</style>
