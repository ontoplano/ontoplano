<script lang="ts">
	/**
	 * ← what you are looking at →, in the one shape the app uses for it.
	 *
	 * Three screens stepped through time three different ways: the plan drew
	 * thumb-sized arrow buttons hugging the date, the review drew the same
	 * ones with a heading between them, and the board drew bordered `←`/`→`
	 * text buttons with a filled "Today" pill — same control, three looks,
	 * one tab apart from each other.
	 *
	 * This is the plan's, which was the right one: the arrows are icon buttons
	 * big enough for a thumb, the label sits between them where the eye
	 * already is when it reaches for them, and the way back to now appears
	 * only when you are not there — a button that says "Today" while today is
	 * on screen is a button that does nothing.
	 *
	 * On a phone it takes the whole row and the arrows go to its two ends; on
	 * a desktop it stays compact, or a wide screen puts a metre of nothing
	 * between an arrow and the date it belongs to.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		onprev,
		onnext,
		onnow,
		/** What the unit is called, for the titles and the labels: "week", "day". */
		unit = t('tasks.plan.week'),
		/** The shortcuts the arrows answer to, printed in their tooltips. */
		keys = ['[', ']'],
		/** Whether the way back to now is worth offering. */
		atNow = true,
		nowLabel = t('ui.today'),
		prevDisabled = false,
		children
	}: {
		onprev: () => void;
		onnext: () => void;
		onnow?: () => void;
		unit?: string;
		keys?: [string, string] | string[];
		atNow?: boolean;
		nowLabel?: string;
		prevDisabled?: boolean;
		/** What sits between the arrows: the date, the week, whatever it is. */
		children: Snippet;
	} = $props();
</script>

<div class="flex w-full items-center gap-2 sm:w-auto">
	<button
		onclick={onprev}
		disabled={prevDisabled}
		class="icon-btn h-11 w-11 shrink-0 disabled:opacity-30"
		title={t('tasks.plan.backOneUnit', { unit, key: keys[0] })}
		aria-label={t('tasks.plan.backOneUnitPlain', { unit })}
	>
		<Icon name="arrow-left" size={22} />
	</button>

	<!--
		The label takes a fixed width, and the arrows stop moving.

		"Sep 19 — Sep 25 · next 7 days" is half as wide again as "Sep 18 — Sep
		24", and on a desktop this block sized itself to whichever it was
		holding — so stepping the week walked the right-hand arrow out from
		under the finger that had just pressed it. Reserved instead, which is
		the app's rule for anything that can change size as a consequence of a
		press.
	-->
	<div class="min-w-0 flex-1 text-center sm:w-72 sm:flex-none sm:text-left">
		{@render children()}
	</div>

	<!--
		The way back to now: drawn always, invisible while you are there.

		It used to be added and removed, which moved the arrow beside it every
		time you stepped away from today or back to it — the same complaint as
		the label above, one element along.
	-->
	{#if onnow}
		<button
			onclick={onnow}
			class="btn btn-sm shrink-0 {atNow ? 'invisible' : ''}"
			aria-hidden={atNow}
			tabindex={atNow ? -1 : 0}
			title={t('tasks.plan.backToLabel', { label: nowLabel.toLowerCase() })}
		>
			{nowLabel}
		</button>
	{/if}

	<button
		onclick={onnext}
		class="icon-btn h-11 w-11 shrink-0"
		title={t('tasks.plan.forwardOneUnit', { unit, key: keys[1] })}
		aria-label={t('tasks.plan.forwardOneUnitPlain', { unit })}
	>
		<Icon name="arrow-right" size={22} />
	</button>
</div>
