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
		children
	}: {
		label: string;
		hint?: string;
		span?: 3 | 4 | 6 | 8 | 12;
		required?: boolean;
		children: Snippet;
	} = $props();

	const SPANS = {
		3: 'sm:col-span-3',
		4: 'sm:col-span-4',
		6: 'sm:col-span-6',
		8: 'sm:col-span-8',
		12: 'sm:col-span-12'
	} as const;
</script>

<label class="col-span-12 block {SPANS[span]}">
	<span class="eyebrow text-gray-500">
		{label}{#if required}<span class="text-gray-400"> *</span>{/if}
	</span>
	<span class="mt-1 block">
		{@render children()}
	</span>
	{#if hint}
		<span class="mt-1 block text-xs text-gray-500">{hint}</span>
	{/if}
</label>
