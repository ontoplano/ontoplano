<script lang="ts">
	/**
	 * The bars, pressed to change them.
	 *
	 * A press sets the bar under it to the height pressed; a double press sets
	 * it to nought. Which bar and what value is `ratingAtPoint` — the same
	 * columns `RatingBadges` draws. Nothing is saved here: whoever draws this
	 * holds the change until it is confirmed.
	 *
	 * From the keyboard there is no point to press, so Enter and Space go to
	 * `onkeyboard` — the form with the sliders, which a keyboard can work.
	 */
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import { ratingAtPoint } from '$lib/rating-press';
	import type { Rating, RatingValues } from '$lib/ratings';

	let {
		values,
		/** A bar changed: which, to what, and the element to open anything beside. */
		onset,
		/** Pressed without a pointer. */
		onkeyboard,
		label,
		muted = false,
		/** Big, for the phone's sheet. See `RatingBadges`. */
		height = undefined
	}: {
		values: Partial<RatingValues>;
		onset: (rating: Rating, value: number, at: HTMLElement) => void;
		onkeyboard: () => void;
		label: string;
		muted?: boolean;
		height?: string;
	} = $props();

	let face = $state<HTMLElement | null>(null);

	function press(event: MouseEvent, twice: boolean) {
		// A keyboard's "click" carries no position to read.
		if (event.detail === 0) {
			onkeyboard();
			return;
		}
		const bars = face?.querySelector<HTMLElement>('.rating-bars');
		if (!bars || !face) return;
		const box = bars.getBoundingClientRect();
		const { rating, value } = ratingAtPoint(
			(event.clientX - box.left) / box.width,
			(event.clientY - box.top) / box.height
		);
		onset(rating, twice ? 0 : value, face);
	}
</script>

<button
	type="button"
	bind:this={face}
	class="flex cursor-pointer"
	aria-label={label}
	onclick={(event) => press(event, false)}
	ondblclick={(event) => press(event, true)}
>
	<RatingBadges {values} stacked {muted} {height} />
</button>
