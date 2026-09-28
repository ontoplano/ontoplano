<script lang="ts">
	import TagInput from '$lib/components/TagInput.svelte';
	import { untrack, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import Field from '$lib/components/Field.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import RecordingAttach from '$lib/components/RecordingAttach.svelte';
	import AttributeFields from '$lib/components/AttributeFields.svelte';
	import { ATTRIBUTE_FORM, attributePairs, mergeSuggestions } from '$lib/attribute-keys';
	import { RATINGS, type Rating } from '$lib/ratings';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * What a todo is made of. See IdeaFields for why this is a component.
	 *
	 * The ratings were already behind a disclosure here; `compact` puts the
	 * category, notebook and notes in with them, so capture is one line to fill
	 * in and the rest one click away rather than a different, lesser form.
	 */
	/**
	 * How tall the notes box opens in the dialog.
	 *
	 * Eight lines: enough for the paragraph most tasks get and short enough
	 * that the ratings and the buttons under it are still on a phone screen.
	 * It grows from there as anybody types — see `TextBox`.
	 */
	const NOTES_ROWS = 8;

	let {
		title = '',
		notes = '',
		tags = '',
		/** Left undefined on a new task, which then starts with its notebook's. */
		categoryId = undefined,
		notebookId = $bindable(null),
		categories = [],
		notebooks = [],
		ratings = $bindable({ urgency: null, interest: null, ease: null }),
		compact = false,
		/**
		 * Where this would land in the queue, drawn under the scales.
		 *
		 * Passed in rather than worked out here: the answer is a place among
		 * the other tasks, and this component knows about one task. Absent
		 * where the form has no list to be ranked against — the capture sheet
		 * on the dashboard is written without one.
		 */
		place = undefined,
		scheduledDate = '',
		/** What it says about itself: `{ url, room, … }`. See `AttributeFields`. */
		attributes = {}
	}: {
		title?: string;
		notes?: string;
		tags?: string;
		categoryId?: number | null;
		notebookId?: number | null;
		categories?: { id: number; name: string }[];
		notebooks?: {
			id: number;
			title: string;
			categoryId?: number | null;
			modules: readonly string[];
		}[];
		ratings?: Record<Rating, number | null>;
		compact?: boolean;
		place?: Snippet;
		/** The day it sits on, or '' for a task with no day yet. */
		scheduledDate?: string;
		attributes?: Record<string, string>;
	} = $props();

	// Seeded once: the dialog is rebuilt on every opening, as the category is.
	let attributeRows = $state(untrack(() => attributePairs(attributes)));
	// What plugins say they read, where the page has loaded their manifests.
	const attributeKeys = $derived(mergeSuggestions(t, page.data.plugins ?? []));

	/*
	 * A notebook's category, filled in rather than applied — the same bargain
	 * NoteFields makes with a notebook's labels. A new task starts with the
	 * notebook's; picking another notebook swaps it only while the box still
	 * says what the last notebook put there, so a category chosen by hand
	 * stays. The dialog is rebuilt on every opening, so this is seeded once.
	 */
	const categoryOf = (id: number | null) =>
		String((id !== null && notebooks.find((one) => one.id === id)?.categoryId) || '');
	let chosenCategory = $state(
		untrack(() => (categoryId === undefined ? categoryOf(notebookId) : String(categoryId ?? '')))
	);
	let lastNotebook = untrack(() => notebookId);
	$effect(() => {
		const now = notebookId;
		untrack(() => {
			if (now === lastNotebook) return;
			if (chosenCategory === categoryOf(lastNotebook)) chosenCategory = categoryOf(now);
			lastNotebook = now;
		});
	});

	/** The notes box, so a recording can be dropped into it where the cursor is. */
	let box = $state<HTMLTextAreaElement>();

	const ratingsSet = $derived(RATINGS.filter((r) => ratings[r] !== null).length);
	const filled = $derived(
		ratingsSet +
			(scheduledDate ? 1 : 0) +
			(chosenCategory ? 1 : 0) +
			(notebookId ? 1 : 0) +
			(notes ? 1 : 0) +
			(tags ? 1 : 0) +
			(attributeRows.some(([key]) => key.trim()) ? 1 : 0)
	);

	/*
	 * With a notebook chosen, the words that subject already uses; with none,
	 * the whole account's vocabulary.
	 */
	const knownTags = $derived(
		notebookId
			? (page.data.tagVocabularyByNotebook?.[notebookId] ?? [])
			: (page.data.tagVocabulary ?? [])
	);
</script>

<Field label={t('ui.title')} span={12} required>
	<!--
		A textarea, not an input: Android offers its saved addresses over one and
		not the other, and no attribute changes that. `OneLine.svelte` says more.
	-->
	<OneLine name="heading" required value={title} />
</Field>

{#snippet details()}
	<!--
		The writing, straight under the name.

		Half the tasks on a working list are a line of title and a paragraph of
		what actually happened. That paragraph was below the day, the category
		and the notebook — three answers somebody usually leaves alone — so the
		one field they came to fill in was the one they had to scroll past the
		rest to reach. What the task is, then what it is about, then where it
		goes.
	-->
	<Field label={t('ui.notes')} span={12}>
		<!-- The same box a note is written in, showing what the words already
		     are rather than the address of the screenshot in the middle of
		     them. `written` because that is what draws a task's notes on the
		     list afterwards. -->
		<!--
			As tall as the room the form is given.

			Three rows in a dialog that opens with half a screen of space under
			it is a box you type two sentences into and then scroll inside,
			while the space it could have used sits empty below. The compact
			form — the one that shares a card with a list — keeps the short box,
			because there the space is not going spare.
		-->
		<MarkdownBox
			bind:element={box}
			value={notes}
			name="notes"
			rows={compact ? 3 : NOTES_ROWS}
			preview="written"
		/>
		<!-- A task said out loud is still a task, and a task is as often a
		     screenshot: the same two attachments a note and an idea have,
		     because "ring the plumber about the thing behind the boiler" is
		     quicker said than typed and "this screen is wrong" is a picture. -->
		<PictureAttach target={box} />
		<RecordingAttach target={box} />
	</Field>

	<Field label={t('ui.tags')} span={12} hint={t('fields.todo.separateWithCommasOrSpaces')}>
		<!-- The account's one vocabulary, not a second one: a word used on a
		     diary entry is the same word here. -->
		<TagInput value={tags} known={knownTags} placeholder={t('fields.todo.tagsExample')} />
	</Field>

	<!-- What the task says about itself — a link, a room, an order number. The
	     same fold a task block has, and carried onto the block when this is put
	     on the plan. -->
	<AttributeFields
		fold
		bind:pairs={attributeRows}
		present={ATTRIBUTE_FORM.present}
		suggestions={attributeKeys}
	/>

	<!--
		A day, optionally.
		
		A task with no day sits in the general list; giving it one puts it on
		that day, which is what the two shapes already mean — `scheduled_date`
		null is "not yet", and a date is "then". The quick form could write a
		task and not say when, so "ring the plumber tomorrow" became a task
		with the word tomorrow in its title and a day that still looked empty.
	-->
	<Field label={t('fields.todo.day')} span={6} hint={t('fields.todo.leaveItForNoDay')}>
		<input
			autocomplete="off"
			name="scheduledDate"
			type="date"
			value={scheduledDate}
			class="input"
		/>
	</Field>

	<Field label={t('ui.category')} span={6}>
		<select name="categoryId" class="select" bind:value={chosenCategory}>
			<option value="">{t('fields.todo.none')}</option>
			{#each categories as cat (cat.id)}
				<option value={String(cat.id)}>{cat.name}</option>
			{/each}
		</select>
	</Field>

	<NotebookField {notebooks} holds="tasks" bind:value={notebookId} />
{/snippet}

{#snippet scales()}
	{#each RATINGS as r (r)}
		<div class="col-span-12 sm:col-span-4">
			<RatingPicker rating={r} bind:value={ratings[r]} />
		</div>
	{/each}
{/snippet}

{#if compact}
	<MoreOptions label={t('fields.todo.categoryNotebookTagsNotesRatings')} count={filled}>
		{@render details()}
		{@render scales()}
		<!-- Unfolded, the scales are on screen, and what they decide should be
		     on screen with them rather than only in the full editor. -->
		{@render place?.()}
	</MoreOptions>
{:else}
	{@render details()}
	<!--
		Three scales, open.

		They were folded because three five-point scales at the top of a create
		form read as work to do before you may write anything down — and the fold
		went too far the other way: they are the thing that decides where a task
		lands, and nobody opens a drawer to find out something they did not know
		was in it. The fold stays, so it can be put away.
	-->
	<MoreOptions label={t('fields.todo.urgencyEaseInterest')} count={ratingsSet} open>
		{@render scales()}
	</MoreOptions>
{/if}
