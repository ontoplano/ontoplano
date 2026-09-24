<script lang="ts">
	import FormGrid from '$lib/components/FormGrid.svelte';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import { compareByPriority, type RatingValues } from '$lib/ratings';
	import { ordinal } from '$lib/ordinal';
	import BuyFields from '$lib/components/fields/BuyFields.svelte';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import NoteFields from '$lib/components/fields/NoteFields.svelte';
	import TodoFields from '$lib/components/fields/TodoFields.svelte';
	import type { Capture } from '$lib/capture';
	import type { Rating } from '$lib/ratings';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * The body of a capture dialog — the same form the section's own dialog uses.
	 *
	 * There were three of these: the dashboard tiles', the header row's and the
	 * pie's, each a single input over the same action. So a field added to a
	 * page was a field capture silently did not have, in three places, and
	 * somebody with thirty seconds *and* something to say had to save the thing
	 * and open it again to add the rest.
	 *
	 * One form now, and it is the page's form: everything but the lead field is
	 * collapsed, because the reason capture exists is that it does not ask you
	 * for anything before you can write.
	 */
	let { capture }: { capture: Capture } = $props();

	/**
	 * The choices the full forms offer, fetched the first time one opens.
	 *
	 * Capture is in the shell, on every page, so loading these with the layout
	 * would run three queries per request for a dialog most visits never open.
	 * The form works without them in the meantime: an empty category list is a
	 * select with nothing in it, not a broken form.
	 */
	type Options = {
		categories: { id: number; name: string }[];
		notebooks: { id: number; title: string }[];
		inventoryCategories: { id: number; name: string }[];
		/** The queue a new task would join — see `whereItWouldSit` below. */
		queue: { ratings: RatingValues; sortOrder: number; createdAt: string }[];
	};

	let options = $state<Options>({
		categories: [],
		notebooks: [],
		inventoryCategories: [],
		queue: []
	});
	/** Whether the answer above is an answer, rather than the state before one. */
	let loaded = $state(false);
	let ratings = $state<Record<Rating, number | null>>({
		urgency: null,
		interest: null,
		ease: null
	});

	$effect(() => {
		// Named so the effect re-runs for each opening: nothing carries over
		// from the last thing that was written down.
		void capture.key;
		ratings = { urgency: null, interest: null, ease: null };
	});

	/*
	 * Where this would land in the queue, live, as the sliders move.
	 *
	 * The same claim the full editor makes at its foot, counted the same way:
	 * by priority and nothing else, because that is the order the three
	 * sliders are for. It is here at all because a sheet that asks for three
	 * numbers and says nothing about what they do is asking for three numbers.
	 *
	 * Not drawn until the queue has actually arrived — "1st in line" against a
	 * list nobody has fetched yet is a guess that happens to be right on an
	 * empty account and wrong on every other. An empty queue that *has*
	 * arrived is a real answer, and the first task somebody writes down is
	 * first in line.
	 */
	const place = $derived(
		options.queue.filter(
			(one) =>
				compareByPriority(one, {
					ratings: ratings as RatingValues,
					sortOrder: 0,
					createdAt: new Date().toISOString()
				}) < 0
		).length + 1
	);

	$effect(() => {
		// `loaded` rather than "are there any categories": an account with none
		// of them fetched successfully and would otherwise ask again on every
		// opening — and never be able to say where a task would land.
		if (loaded) return;
		fetch('/api/capture-options')
			.then((res) => (res.ok ? res.json() : null))
			.then((got) => {
				if (!got) return;
				options = got;
				loaded = true;
			})
			.catch(() => {});
	});
</script>

<FormGrid>
	{#if capture.key === 'idea'}
		<IdeaFields compact />
	{:else if capture.key === 'note'}
		<!--
			A note, and where it goes.

			It said "Diary note" and offered no choice, which named the place
			rather than the thing and then hid the only decision there is. It is
			a note; the picker under it says whether it lands in the diary or in
			one of the notebooks, and it starts on the diary.
		-->
		<NoteFields compact label={t('app.note')} notebooks={options.notebooks} />
	{:else if capture.key === 'todo'}
		<TodoFields
			compact
			categories={options.categories}
			notebooks={options.notebooks}
			bind:ratings
			place={loaded ? whereItWouldSit : undefined}
		/>
	{:else}
		<BuyFields compact categories={options.inventoryCategories} />
	{/if}
</FormGrid>

<!--
	What the three sliders decide, said under them.

	The same two things the full editor's footer shows — the bars the card will
	wear, and where it lands — so the quick sheet and the editor are making the
	same claim rather than the sheet being the version with no answer.
-->
{#snippet whereItWouldSit()}
	<span
		class="col-span-12 flex items-center justify-center gap-2 text-sm"
		title={t('ratings.whereItWouldSit')}
	>
		<RatingBadges values={ratings} />
		<span class="tabular text-gray-700">
			{t('ratings.nthInLine', { nth: ordinal(t, place) })}
		</span>
	</span>
{/snippet}
