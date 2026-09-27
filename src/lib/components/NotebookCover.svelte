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
	import type { Notebook } from '$lib/services/notebooks';
	import type { NotebookModule } from '$lib/notebook-modules';
	import type { KeyWithValues } from '$lib/i18n/keys';
	import { useT } from '$lib/i18n';
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	const t = useT();

	let {
		notebook,
		href,
		chosen = false,
		/** What can be done to it, drawn in the corner of the cover. */
		actions,
		/** Its star, in the other corner — see `NotebookStar`. */
		star
	}: {
		notebook: Notebook;
		href: string;
		chosen?: boolean;
		actions?: Snippet;
		star?: Snippet;
	} = $props();

	/** Its own name: the folder it is in is the shelf's to show. */
	const name = $derived(notebook.title);

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
			{#if notebook.favourite && !star}
				<!-- Said on the cover where there is no star button to say it. -->
				<span class="cover-star" title={t('notebooks.favourites')}>
					<Icon name="star" size={11} />
				</span>
			{/if}
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
	{#if star}
		<div class="cover-actions cover-actions-start" class:is-held={notebook.favourite}>
			{@render star()}
		</div>
	{/if}
</div>

<style>
	.cover-star {
		display: inline-flex;
		vertical-align: -1px;
	}
	.cover-star :global(path) {
		fill: currentColor;
	}
	/* A star that is on stays showing, so the shelf says which are favourites. */
	/*
	 * In the bottom corner of the picture: a cover is one row of buttons wide,
	 * and the top one is taken. The picture is the shelf's column (6.5rem) less
	 * the face's padding, at 3:4 — see `.notebook-shelf` and `.cover-art`.
	 */
	.cover-actions-start {
		top: calc(0.375rem + (6.5rem - 0.75rem) * 4 / 3 - 2.25rem - 0.25rem);
		right: auto;
		left: 0.625rem;
	}
	.cover-actions-start.is-held {
		opacity: 1;
	}
</style>
