<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One labelled control.
	 *
	 * Every form in the app used to size its own fields — `w-40` here,
	 * `min-w-64 flex-1` there — so nothing lined up either down the page or
	 * across it. A field is a column count on a grid now, and the label, the
	 * control and the hint always sit in the same places.
	 */
	let {
		label,
		hint = '',
		/** Columns out of twelve, at `sm` and up. Below that everything is full width. */
		span = 12,
		required = false,
		/**
		 * Several controls under one heading, rather than one control.
		 *
		 * A field is a `<label>`, which is what makes clicking its words focus
		 * its input — and what makes it wrong for a group: a label wrapping
		 * five checkboxes lends its whole text to each of them, so the first
		 * box in a list of modules was announced as the heading, the
		 * explanation and every other box's name. A group is a `<fieldset>`
		 * with a `<legend>`, which is the same thing said correctly.
		 */
		group = false,
		children
	}: {
		label: string;
		hint?: string;
		span?: 3 | 4 | 6 | 8 | 12;
		required?: boolean;
		group?: boolean;
		children: Snippet;
	} = $props();

	const SPANS = {
		3: 'sm:col-span-3',
		4: 'sm:col-span-4',
		6: 'sm:col-span-6',
		8: 'sm:col-span-8',
		12: 'sm:col-span-12'
	} as const;

	/** What counts as pressing something of its own, inside the field. */
	const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';
	/** Where a press on the label's own words or empty space should go. */
	const TYPED = 'input:not([type="hidden"]), textarea, select';

	/*
	 * A press on the label that would land on a button is sent to the box.
	 *
	 * A label hands every press on it to its first labelable descendant, and a
	 * button is labelable. Around the tag box that first one is the first
	 * chip's ×, so clicking the field's name or the blank beside the chips took
	 * a tag off. A label is for pointing at the thing you type into.
	 */
	function onLabelClick(e: MouseEvent) {
		const label = e.currentTarget as HTMLLabelElement;
		if (!(label.control instanceof HTMLButtonElement)) return;
		if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
		e.preventDefault();
		label.querySelector<HTMLElement>(TYPED)?.focus();
	}
</script>

{#if group}
	<fieldset class="col-span-12 block {SPANS[span]}">
		<legend class="eyebrow text-gray-600">
			{label}{#if required}<span class="text-gray-500"> *</span>{/if}
		</legend>
		<div class="mt-1 block">
			{@render children()}
		</div>
		{#if hint}
			<span class="mt-1 block text-xs text-gray-500">{hint}</span>
		{/if}
	</fieldset>
{:else}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<label class="col-span-12 block {SPANS[span]}" onclick={onLabelClick}>
		<span class="eyebrow text-gray-600">
			{label}{#if required}<span class="text-gray-500"> *</span>{/if}
		</span>
		<span class="mt-1 block">
			{@render children()}
		</span>
		{#if hint}
			<span class="mt-1 block text-xs text-gray-500">{hint}</span>
		{/if}
	</label>
{/if}
