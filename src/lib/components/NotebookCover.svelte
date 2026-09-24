<script lang="ts">
	/**
	 * A notebook as the thing it is: its cover, with the name glued under it.
	 *
	 * The shelf on `/notebooks` is made of these, and so is the dashboard card
	 * that shows the three most recently written in. They were going to be two
	 * drawings of the same object — which is how the app's tabs drifted apart
	 * once already — so the cover, the name and the tally live here and the
	 * callers say only where it points and what can be done to it.
	 *
	 * The styles are in `layout.css` under `.notebook-shelf`: a shelf is a grid
	 * of covers at a fixed size, and both callers put this inside one.
	 */
	import { NOTEBOOK_SEPARATOR, type Notebook } from '$lib/services/notebooks';
	import type { NotebookModule } from '$lib/notebook-modules';
	import type { KeyWithValues } from '$lib/i18n/keys';
	import { useT } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	const t = useT();

	let {
		notebook,
		href,
		chosen = false,
		/** What can be done to it, drawn in the corner of the cover. */
		actions
	}: {
		notebook: Notebook;
		href: string;
		chosen?: boolean;
		actions?: Snippet;
	} = $props();

	/** `Renovation — Kitchen` under `Renovation` is called "Kitchen" there. */
	const name = $derived(notebook.title.split(NOTEBOOK_SEPARATOR).at(-1) ?? notebook.title);

	/** Each of these takes a `count`, so none of them is a `PlainKey`. */
	type CountKey = Extract<KeyWithValues, `notebooks.${string}Count`>;

	const COUNT_LABELS: Partial<Record<NotebookModule, CountKey>> = {
		notes: 'notebooks.notesCount',
		tasks: 'notebooks.tasksCount',
		goals: 'notebooks.goalsCount',
		ideas: 'notebooks.ideasCount',
		inventory: 'notebooks.inventoryCount',
		ledgers: 'notebooks.ledgersCount',
		bills: 'notebooks.billsCount',
		habits: 'notebooks.habitsCount',
		workouts: 'notebooks.workoutsCount',
		recipes: 'notebooks.recipesCount'
	};

	/**
	 * "12 notes · 3 tasks · 1 goal", with nothing said about what is empty.
	 *
	 * Notes, not entries: writing in a notebook is a note and writing in the
	 * diary is an entry. One part per module the notebook actually holds, in
	 * the order its tabs are in, so the cover and the tabs agree.
	 */
	const tally = $derived.by(() => {
		const parts = notebook.modules
			.map((module) => {
				const count = notebook.counts[module] ?? 0;
				const label = COUNT_LABELS[module];
				return count && label ? t(label, { count }) : null;
			})
			.filter((part): part is string => part !== null);
		return parts.join(' · ') || t('notebooks.nothingInItYet');
	});
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div class="notebook-cover">
	<!-- Already resolved: the caller builds this with `resolve()`. -->
	<a
		{href}
		class="cover-face {chosen ? 'is-chosen' : ''}"
		aria-current={chosen ? 'true' : undefined}
	>
		<!-- A cover with no picture is a blank cover, not a cover with a notebook
		     drawn on it: a shelf of identical glyphs is noise where the picture is
		     supposed to be the thing you read. -->
		{#if notebook.pictureId}
			<img src="/media/{notebook.pictureId}" alt="" loading="lazy" class="cover-art" />
		{:else}
			<span class="cover-art cover-art-empty" aria-hidden="true"></span>
		{/if}

		<span class="cover-name" class:text-gray-500={notebook.closedAt}>
			{name}
		</span>
		<span class="cover-tally">
			{tally}
			{#if !notebook.mine}
				· {notebook.sharedBy}’s
			{:else if notebook.sharedWithFamily}
				· {t('notebooks.family')}
			{/if}
			{#if notebook.closedAt}
				· {t('notebooks.closed')}
			{/if}
		</span>
	</a>

	{#if actions}
		<!--
			What you do to it, on the cover rather than in a column of their own:
			a shelf has no columns.
		-->
		<div class="cover-actions">{@render actions()}</div>
	{/if}
</div>
