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
	 * currently going. The menu itself is `Picker`, which the filters beside
	 * this one use too, so a toolbar has one kind of control in it.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Picker from '$lib/components/Picker.svelte';
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

	/* The orders, as the picker wants them: a value and the word for it. */
	const choices = $derived(options.map((one) => ({ value: one, label: t(labels[one]) })));
</script>

<div class="flex shrink-0 items-center gap-1">
	<Picker {value} options={choices} {onpick} {label} />

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
</div>
