<script lang="ts" generics="T extends string">
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	const t = useT();

	/**
	 * One row of "show me which of these", the same everywhere.
	 *
	 * Ideas drew two of these rows with two different selected colours — one
	 * violet, one amber, a line apart — Habits drew a third in four colours of
	 * its own, and each named its group in shouty capitals of a different
	 * size. A filter is a filter: the chosen one wears the section's accent,
	 * the rest are quiet, and the group's name sits beside them in the one
	 * label style the app has.
	 */
	let {
		label = '',
		options,
		value = $bindable(),
		onchange
	}: {
		/** What this row filters by: "Applied", "Favourite", "Kind". */
		label?: string;
		/** Each option's name, as a message key — the chips are drawn here. */
		options: readonly { value: T; label: PlainKey }[];
		value: T;
		/** Told after the value changes, for lists that reset their cursor. */
		onchange?: (value: T) => void;
	} = $props();

	function choose(next: T) {
		value = next;
		onchange?.(next);
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	{#if label}
		<span class="eyebrow shrink-0 text-gray-500">{label}</span>
	{/if}
	{#each options as option (option.value)}
		<button
			type="button"
			onclick={() => choose(option.value)}
			aria-pressed={value === option.value}
			class="chip {value === option.value ? 'chip-on' : ''}"
		>
			{t(option.label)}
		</button>
	{/each}
</div>

<style>
	/*
	 * The chosen one, in the section's own colour.
	 *
	 * `--section-accent` is set on the room's surface by the shell, so a
	 * filter in Ideas is violet and the same filter in Health is green
	 * without either of them naming a colour.
	 */
	.chip-on {
		border-color: var(--section-accent, var(--color-gray-900));
		background-color: color-mix(
			in srgb,
			var(--section-accent, var(--color-gray-900)) 16%,
			transparent
		);
		color: var(--color-gray-900);
		font-weight: 600;
	}
</style>
