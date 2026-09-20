<script lang="ts" generics="T extends string">
	/**
	 * Choosing an order, the same way in every list.
	 *
	 * Two different controls had grown for one job. A notebook's notes used a
	 * native `<select>` beside an arrow — which works, and looks like a form
	 * field dropped into a toolbar. A notebook's tasks used a single button
	 * that cycled through the orders, which looks right and is a guessing game:
	 * you cannot see what the options are, you cannot go back, and there is no
	 * direction at all.
	 *
	 * So: one control with the behaviour of the first and the manners of the
	 * second. The button says what the order is; pressing it opens the list;
	 * the arrow beside it flips the direction and says which way it is
	 * currently going.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	let {
		value,
		options,
		labels,
		direction = 'desc',
		onpick,
		onflip,
		label
	}: {
		value: T;
		options: readonly T[];
		/** What each option is called, as a catalogue key. */
		labels: Record<T, PlainKey>;
		direction?: 'asc' | 'desc';
		onpick: (next: T) => void;
		onflip: () => void;
		/** What this control is, for whoever is not looking at it. */
		label: string;
	} = $props();

	const t = useT();

	let open = $state(false);
	let root = $state<HTMLElement>();

	/*
	 * Pressing anywhere else closes it. A menu that only closes by choosing
	 * something makes choosing nothing impossible.
	 */
	function elsewhere(event: MouseEvent) {
		if (!open || !root) return;
		if (!root.contains(event.target as Node)) open = false;
	}

	function onKey(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			open = false;
		}
	}
</script>

<svelte:window onclick={elsewhere} onkeydown={onKey} />

<div bind:this={root} class="relative flex shrink-0 items-center gap-1">
	<button
		type="button"
		class="btn btn-sm"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open = !open)}
	>
		{t(labels[value])}
		<Icon name="chevron-down" size={12} />
	</button>

	<!--
		The direction, beside the order rather than inside it.

		Which way a list runs is a different question from what it is sorted by,
		and folding both into one menu doubles its length to say the same two
		things. The arrow points the way the list currently runs.
	-->
	<button
		type="button"
		onclick={onflip}
		class="icon-btn shrink-0"
		aria-label={direction === 'asc'
			? t('sort.ascendingPressForDescending')
			: t('sort.descendingPressForAscending')}
		title={direction === 'asc'
			? t('sort.ascendingPressForDescending')
			: t('sort.descendingPressForAscending')}
	>
		<Icon name={direction === 'asc' ? 'arrow-up' : 'arrow-down'} />
	</button>

	{#if open}
		<ul
			class="overlay-face absolute top-full right-0 z-20 mt-1 min-w-36 overflow-hidden border shadow-overlay"
			role="listbox"
			aria-label={label}
		>
			{#each options as option (option)}
				<li role="presentation">
					<button
						type="button"
						role="option"
						aria-selected={option === value}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm {option === value
							? 'bg-gray-100'
							: ''}"
						onclick={() => {
							onpick(option);
							open = false;
						}}
					>
						<!-- The tick keeps its place, so the row does not shift when the
						     chosen one changes. -->
						<span class="w-3 shrink-0">
							{#if option === value}<Icon name="check" size={12} />{/if}
						</span>
						{t(labels[option])}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
