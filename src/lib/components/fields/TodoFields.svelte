<script lang="ts">
	import TagInput from '$lib/components/TagInput.svelte';
	import { page } from '$app/state';
	import Field from '$lib/components/Field.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import RecordingAttach from '$lib/components/RecordingAttach.svelte';
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
		categoryId = null,
		notebookId = null,
		categories = [],
		notebooks = [],
		ratings = $bindable({ urgency: null, interest: null, ease: null }),
		compact = false,
		scheduledDate = ''
	}: {
		title?: string;
		notes?: string;
		tags?: string;
		categoryId?: number | null;
		notebookId?: number | null;
		categories?: { id: number; name: string }[];
		notebooks?: { id: number; title: string }[];
		ratings?: Record<Rating, number | null>;
		compact?: boolean;
		/** The day it sits on, or '' for a task with no day yet. */
		scheduledDate?: string;
	} = $props();

	/** The notes box, so a recording can be dropped into it where the cursor is. */
	let box = $state<HTMLTextAreaElement>();

	const ratingsSet = $derived(RATINGS.filter((r) => ratings[r] !== null).length);
	const filled = $derived(
		ratingsSet +
			(scheduledDate ? 1 : 0) +
			(categoryId ? 1 : 0) +
			(notebookId ? 1 : 0) +
			(notes ? 1 : 0) +
			(tags ? 1 : 0)
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
		<select name="categoryId" class="select">
			<option value="">{t('fields.todo.none')}</option>
			{#each categories as cat (cat.id)}
				<option value={cat.id} selected={categoryId === cat.id}>{cat.name}</option>
			{/each}
		</select>
	</Field>

	<NotebookField {notebooks} value={notebookId} />

	<Field label={t('ui.tags')} span={12} hint={t('fields.todo.separateWithCommasOrSpaces')}>
		<!-- The account's one vocabulary, not a second one: a word used on a
		     diary entry is the same word here. -->
		<TagInput
			value={tags}
			known={page.data.tagVocabulary ?? []}
			placeholder={t('fields.todo.tagsExample')}
		/>
	</Field>

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
	</MoreOptions>
{:else}
	{@render details()}
	<!-- Three optional five-point scales at the top of a create form read as
	     work to do before you may write anything down. -->
	<MoreOptions label={t('fields.todo.urgencyInterestEase')} count={ratingsSet}>
		{@render scales()}
	</MoreOptions>
{/if}
