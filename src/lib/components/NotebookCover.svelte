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

	/** A screen that cannot hover — the same query as `.taps-to-reveal` in `layout.css`. */
	const HOVERLESS = '(hover: none)';

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

	/*
	 * Its buttons show on hover, and a screen with no hover has to ask for them.
	 *
	 * So there a tap on the picture shows them rather than opening it, and
	 * Open is one of them; a tap on the name still opens it straight away, and
	 * a tap anywhere else puts them away again.
	 */
	const hasTools = $derived(Boolean(actions || star));
	let revealed = $state(false);
	let root: HTMLDivElement | undefined = $state();

	function onFaceClick(event: MouseEvent) {
		if (!hasTools || revealed || !window.matchMedia(HOVERLESS).matches) return;
		if (!(event.target as Element).closest('.cover-art')) return;
		event.preventDefault();
		revealed = true;
	}

	function onWindowPointerDown(event: PointerEvent) {
		if (revealed && !root?.contains(event.target as Node)) revealed = false;
	}

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

<svelte:window onpointerdown={onWindowPointerDown} />

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div
	bind:this={root}
	class="notebook-cover"
	class:taps-to-reveal={hasTools}
	class:is-revealed={revealed}
>
	<!-- Already resolved: the caller builds this with `resolve()`. -->
	<a
		{href}
		class="cover-face {chosen ? 'is-chosen' : ''}"
		title="{name} · {tally}"
		aria-current={chosen ? 'true' : undefined}
		onclick={onFaceClick}
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
			{#if notebook.favourite}
				<!-- Said on the cover, because the star button only shows on hover. -->
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

	{#if hasTools}
		<!--
			What you do to it, on the cover rather than in a column of their own:
			a shelf has no columns. One column of buttons, the star first; Open
			leads it only where there is no hover and a tap on the picture brought
			them, and there they fill the picture.
		-->
		<div class="cover-actions">
			<a
				{href}
				class="icon-btn cover-open"
				title={t('ui.open')}
				aria-label={t('notebooks.openNamed', { title: name })}
			>
				<Icon name="arrow-right" />
			</a>
			{@render star?.()}
			{@render actions?.()}
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
</style>
