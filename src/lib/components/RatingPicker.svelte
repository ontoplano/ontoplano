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

<!--
	Stacked, not side by side.

	The name and the hint used to share a line and the two ends of the scale sat
	either side of the buttons — four things across a column a third of a form
	wide. "Urgency" broke as "URGEN / CY", the hint wrapped to three lines, and
	the whole thing read as damage. Everything is on its own line now, and the
	ends of the scale sit under the numbers they describe, which is also where
	you would look for them.
-->
<div class={compact ? 'flex items-center gap-2' : 'space-y-1.5'}>
	{#if compact}
		<span class="eyebrow w-16 shrink-0 text-gray-600">{RATING_LABELS[rating]}</span>
	{:else}
		<div>
			<div class="eyebrow whitespace-nowrap text-gray-600">{RATING_LABELS[rating]}</div>
			<div class="text-xs leading-tight text-gray-500">{RATING_HINTS[rating]}</div>
		</div>
	{/if}

	<div class="min-w-0">
		<div class="flex items-center gap-1">
			{#each steps as n (n)}
				<button
					type="button"
					onclick={() => pick(n)}
					aria-pressed={value === n}
					aria-label="{RATING_LABELS[rating]} {n} of {RATING_MAX}"
					title="{RATING_LABELS[rating]} {n}"
					class="tabular h-7 w-7 border text-xs {value !== null && n <= value
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-500 hover:border-gray-500 hover:text-gray-700'}"
				>
					{n}
				</button>
			{/each}
			{#if value !== null}
				<button
					type="button"
					onclick={() => (value = null)}
					class="ml-1 text-sm text-gray-500 hover:text-gray-900"
					title="Clear {RATING_LABELS[rating]}"
					aria-label="Clear {RATING_LABELS[rating]}"
				>
					×
				</button>
			{/if}
		</div>

		{#if !compact}
			<!-- Under the numbers, and only as wide as they are, so "whenever" sits
			     beneath the 1 and "now" beneath the 5. -->
			<div
				class="mt-0.5 flex justify-between text-[10px] text-gray-500"
				style="width: {steps.length * 1.75 + (steps.length - 1) * 0.25}rem"
			>
				<span>{low}</span>
				<span>{high}</span>
			</div>
		{/if}
	</div>
</div>
