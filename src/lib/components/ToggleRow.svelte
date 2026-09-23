<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * One thing that can be switched on or off, drawn the same way everywhere.
	 *
	 * Three lists ask this question — the rooms in Preferences, the tabs inside
	 * each of them, and what a notebook holds — and they had three answers:
	 * different paddings, different borders, and a button whose word changed
	 * from Hide to Show under the cursor. A toggle that relabels itself when
	 * pressed is the same defect as a page that reflows when pressed: you
	 * cannot press it twice without reading it again, and the row twitches
	 * because "Show" and "Hide" are not the same width.
	 *
	 * So it is a checkbox, which is the platform's own answer: its label never
	 * changes, its state is the tick, and it posts without any script running.
	 * Ticked means the thing is there.
	 *
	 * `leading` and `trailing` are for what a particular list needs beside the
	 * question — the menu's position number and colour on one side, its arrows
	 * on the other — so that the row's padding, its border and where its label
	 * sits are decided once, here, rather than per screen.
	 */
	let {
		label,
		/** The form field this posts as, when it is posting rather than driving state. */
		name = undefined,
		value = undefined,
		on = false,
		/** Can be read but not changed — a room's tabs while the room itself is away. */
		locked = false,
		/** Always on, and said so rather than offered: notes in a notebook. */
		always = false,
		/** The fixed slot at the end: how much is filed under it, or why it cannot change. */
		note = undefined,
		/** A tab inside a room rather than a room: stepped in, with a left rule. */
		nested = false,
		onToggle = undefined,
		leading = undefined,
		trailing = undefined
	}: {
		label: string;
		name?: string;
		value?: string;
		on?: boolean;
		locked?: boolean;
		always?: boolean;
		note?: string;
		nested?: boolean;
		onToggle?: (on: boolean) => void;
		leading?: Snippet;
		trailing?: Snippet;
	} = $props();

	/** Nothing to press: it is either never off, or already off with its room. */
	const fixed = $derived(locked || always);
</script>

<div
	class="flex items-center gap-3 border px-3 text-sm {nested
		? 'ml-8 border-l-2 border-gray-200 border-l-gray-300 py-1.5'
		: on
			? 'border-gray-200 py-2'
			: 'border-dashed border-gray-300 bg-gray-50 py-2'}"
>
	{@render leading?.()}

	{#if fixed}
		<!--
			A room that is itself put away says so once at its own row; offering
			the choice again on each of its tabs is one answer asked three times.
			Drawn as words rather than a disabled checkbox, because a control you
			cannot use only teaches you that the controls do not work.
		-->
		<!--
			The checkbox's place, kept empty. Without it the labels of the rows
			that cannot be switched start a checkbox further left than the rest,
			and a list of nine reads as two lists.
		-->
		<span class="size-4 shrink-0" aria-hidden="true"></span>
		<span class="min-w-0 flex-1 truncate {always ? 'text-gray-900' : 'text-gray-500'}">{label}</span
		>
		{@render trailing?.()}
		<span class="eyebrow shrink-0 text-gray-500"
			>{note ?? (always ? t('ui.alwaysOn') : t('ui.withTheRoom'))}</span
		>
	{:else}
		<label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
			<input
				type="checkbox"
				{name}
				{value}
				checked={on}
				class="size-4 shrink-0"
				onchange={(e) => onToggle?.(e.currentTarget.checked)}
			/>
			<span class="min-w-0 flex-1 truncate {on ? 'text-gray-900' : 'text-gray-500'}">{label}</span>
		</label>
		{@render trailing?.()}
		{#if note}
			<span class="eyebrow shrink-0 text-gray-500">{note}</span>
		{/if}
	{/if}
</div>
