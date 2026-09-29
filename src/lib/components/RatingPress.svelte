<script lang="ts">
	/**
	 * The bars, pressed to change them.
	 *
	 * A press sets the bar under it to the height pressed; a double press sets
	 * it to nought. Which bar and what value is `ratingAtPoint` — the same
	 * columns `RatingBadges` draws. Nothing is saved here: whoever draws this
	 * holds the change until it is confirmed.
	 *
	 * A mouse held down and dragged keeps setting whichever bar is under it,
	 * so the bars follow the pointer. A finger on a card is scrolling the list,
	 * so there it is a tap; `touch` lets a finger drag too, where nothing
	 * scrolls — the phone's sheet.
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
		height = undefined,
		/** A finger drags as a mouse does, rather than scrolling. */
		touch = false
	}: {
		values: Partial<RatingValues>;
		onset: (rating: Rating, value: number, at: HTMLElement) => void;
		onkeyboard: () => void;
		label: string;
		muted?: boolean;
		height?: string;
		touch?: boolean;
	} = $props();

	let face = $state<HTMLElement | null>(null);
	/** A drag in progress, and the last thing it set, so a still pointer sends nothing. */
	let held = false;
	let last = '';
	/** The press was answered on the way down, so its click is not a second one. */
	let answered = false;

	function set(event: MouseEvent, twice: boolean) {
		const bars = face?.querySelector<HTMLElement>('.rating-bars');
		if (!bars || !face) return;
		const box = bars.getBoundingClientRect();
		const { rating, value } = ratingAtPoint(
			(event.clientX - box.left) / box.width,
			(event.clientY - box.top) / box.height
		);
		const next = twice ? 0 : value;
		if (!twice && `${rating}:${next}` === last) return;
		last = `${rating}:${next}`;
		onset(rating, next, face);
	}

	function down(event: PointerEvent) {
		if (event.button !== 0) return;
		if (event.pointerType === 'touch' && !touch) return;
		held = true;
		answered = true;
		last = '';
		face?.setPointerCapture(event.pointerId);
		set(event, false);
	}

	function move(event: PointerEvent) {
		if (held) set(event, false);
	}

	function up() {
		held = false;
	}

	function click(event: MouseEvent) {
		// A keyboard's "click" carries no position to read.
		if (event.detail === 0) {
			onkeyboard();
			return;
		}
		if (answered) {
			answered = false;
			return;
		}
		last = '';
		set(event, false);
	}
</script>

<button
	type="button"
	bind:this={face}
	class="flex cursor-pointer select-none"
	style:touch-action={touch ? 'none' : undefined}
	aria-label={label}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onclick={click}
	ondblclick={(event) => set(event, true)}
>
	<RatingBadges {values} stacked {muted} {height} />
</button>
