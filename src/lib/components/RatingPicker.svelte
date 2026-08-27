<script lang="ts">
	import {
		RATING_HINTS,
		RATING_LABELS,
		RATING_MAX,
		RATING_MIN,
		RATING_SCALE_ENDS,
		type Rating
	} from '$lib/ratings.js';

	let {
		rating,
		value = $bindable(null),
		name = rating,
		compact = false
	}: {
		rating: Rating;
		value?: number | null;
		/** Form field name; defaults to the rating's own name. */
		name?: string;
		compact?: boolean;
	} = $props();

	const [low, high] = RATING_SCALE_ENDS[rating];
	const steps = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

	/** Clicking the current value clears it — unrated is a real answer. */
	function pick(n: number) {
		value = value === n ? null : n;
	}
</script>

<!-- The value travels as a normal form field, so this works inside any form
     without extra wiring. Empty string means "unrated". -->
<input type="hidden" {name} value={value ?? ''} />

<div class={compact ? 'flex items-center gap-2' : 'space-y-1'}>
	<div class={compact ? 'w-16 shrink-0' : 'flex items-baseline justify-between'}>
		<span class="eyebrow text-gray-600">{RATING_LABELS[rating]}</span>
		{#if !compact}
			<span class="text-xs text-gray-500">{RATING_HINTS[rating]}</span>
		{/if}
	</div>

	<div class="flex items-center gap-1">
		{#if !compact}
			<span class="w-16 shrink-0 text-right text-[10px] text-gray-500">{low}</span>
		{/if}
		{#each steps as n (n)}
			<button
				type="button"
				onclick={() => pick(n)}
				aria-pressed={value === n}
				aria-label="{RATING_LABELS[rating]} {n} of {RATING_MAX}"
				title="{RATING_LABELS[rating]} {n}"
				class="tabular h-6 w-6 border text-xs {value !== null && n <= value
					? 'border-gray-900 bg-gray-900 font-semibold text-white'
					: 'border-gray-300 bg-white text-gray-500 hover:border-gray-500 hover:text-gray-700'}"
			>
				{n}
			</button>
		{/each}
		{#if !compact}
			<span class="w-16 shrink-0 text-[10px] text-gray-500">{high}</span>
		{/if}
		{#if value !== null}
			<button
				type="button"
				onclick={() => (value = null)}
				class="ml-1 text-xs text-gray-500 hover:text-gray-900"
				title="Clear {RATING_LABELS[rating]}"
				aria-label="Clear {RATING_LABELS[rating]}"
			>
				×
			</button>
		{/if}
	</div>
</div>
