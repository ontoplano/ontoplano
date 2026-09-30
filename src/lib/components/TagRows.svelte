<script lang="ts">
	import type { PlainKey } from '$lib/i18n/keys';
	/**
	 * A list of labels, with what each of them is doing.
	 *
	 * Two screens ask this: the account's whole vocabulary, and the labels
	 * inside one notebook. They are the same list of the same things — a chip,
	 * what the word means here, how much it is carrying, and the way to change
	 * or remove it — so they are one component rather than two that drift.
	 *
	 * What differs is only the question: the account's list counts everything
	 * including the pictures, a notebook's counts what is filed in it. The
	 * breakdown arrives already counted, in `$lib/services/tags`.
	 */
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { keepInView } from '$lib/actions/keep-in-view';
	import Icon from '$lib/components/Icon.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import type { NotebookTag, TagUseKind } from '$lib/services/tags';
	import { useT } from '$lib/i18n';
	import type { KeyWithValues } from '$lib/i18n/keys';

	const t = useT();

	let {
		tags,
		/** Which row the keyboard is on, where the screen walks them. */
		cursor = -1,
		/** Where the delete form posts. Absent, a label cannot be removed here. */
		deleteAction,
		/** What the delete says, where it removes less than the whole label. */
		deleteTitle = 'ui.delete',
		deleteConfirm = 'notebooks.tags.yesDelete',
		/**
		 * An empty rail before the chip, so the chip starts on the column every
		 * room's words start on (`--row-text-x`). A room's list wants it; the
		 * list inside a notebook's dialog has no other rows to line up with.
		 */
		rail = false,
		onedit
	}: {
		tags: NotebookTag[];
		cursor?: number;
		deleteAction?: string;
		deleteTitle?: PlainKey;
		deleteConfirm?: PlainKey;
		rail?: boolean;
		onedit: (tag: NotebookTag) => void;
	} = $props();

	/** Each of these counts, so none of them is a `PlainKey`. */
	const USE_LABELS: Record<TagUseKind, Extract<KeyWithValues, `tags.uses.${string}`>> = {
		notes: 'tags.uses.notes',
		tasks: 'tags.uses.tasks',
		ideas: 'tags.uses.ideas',
		pictures: 'tags.uses.pictures'
	};

	/*
	 * Which rows have been unfolded.
	 *
	 * "3 things carry it" is a number and not an answer — it says how much a
	 * word is doing and nothing about where to go and look. The breakdown is
	 * one press away rather than always drawn, because a list of forty labels
	 * each spelling out its three kinds is a wall.
	 */
	let open = $state<number[]>([]);
	const shown = (id: number) => open.includes(id);
	const toggle = (id: number) =>
		(open = shown(id) ? open.filter((one) => one !== id) : [...open, id]);

	let confirmDelete = $state<number | null>(null);

	export function clearConfirm(): void {
		confirmDelete = null;
	}

	/** Unfold or fold one row's breakdown — Enter on the row under the cursor. */
	export function toggleUses(id: number): void {
		if (tags.find((one) => one.id === id)?.by.length) toggle(id);
	}
</script>

<div class="divide-y divide-gray-200" data-tour="tag-list">
	{#each tags as tag, i (tag.id)}
		<div use:keepInView={cursor === i} class="list-row {cursor === i ? 'kb-cursor' : ''}">
			{#if rail}<span class="row-rail"></span>{/if}
			<!--
				The label as every other room draws it, so a colour is chosen against
				the thing it will actually look like — and what the word means here
				beside it, where there is an answer. `#short` on the shopping and
				`#short` on a book are not the same idea.
			-->
			<div class="list-row-main flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
				<TagChip name={tag.name} color={tag.color} class="shrink-0" />
				{#if tag.description}
					<span class="min-w-0 text-xs text-gray-500">{tag.description}</span>
				{/if}
			</div>

			<div class="list-row-actions">
				<!--
					The count, and what is under it, at the head of the verbs: a column
					whose right edge holds still, rather than a phrase trailing each chip
					at whatever x the chip ended on.

					A button where there is something to open and plain text where there
					is not: a control that does nothing is one somebody presses twice
					before deciding the app is broken.
				-->
				{#if tag.by.length > 0}
					<button
						type="button"
						class="btn btn-sm btn-quiet tag-uses"
						aria-expanded={shown(tag.id)}
						title={shown(tag.id)
							? t('tags.hideWhatCarriesIt', { tag: tag.name })
							: t('tags.showWhatCarriesIt', { tag: tag.name })}
						aria-label={shown(tag.id)
							? t('tags.hideWhatCarriesIt', { tag: tag.name })
							: t('tags.showWhatCarriesIt', { tag: tag.name })}
						onclick={() => toggle(tag.id)}
					>
						<span class="tabular">{tag.uses}</span>
						<span class="hidden sm:inline"
							>{tag.uses === 1
								? t('notebooks.tags.thingCarriesIt')
								: t('notebooks.tags.thingsCarryIt')}</span
						>
						<Icon name={shown(tag.id) ? 'chevron-down' : 'chevron-right'} size={12} />
					</button>
				{:else}
					<span class="tag-uses px-2 text-xs text-gray-500">
						{t('tags.nothingCarriesItHere')}
					</span>
				{/if}

				<button
					title={t('ui.edit')}
					aria-label={t('ui.edit')}
					onclick={() => onedit(tag)}
					class="icon-btn"
				>
					<Icon name="edit" />
				</button>

				{#if deleteAction}
					{#if confirmDelete === tag.id}
						<form
							method="post"
							action={deleteAction}
							use:enhance={() =>
								async ({ update }) => {
									confirmDelete = null;
									await update();
								}}
							class="flex items-center gap-1"
						>
							<input type="hidden" name="id" value={tag.id} />
							<button type="button" onclick={() => (confirmDelete = null)} class="btn btn-sm">
								{t('ui.cancel')}
							</button>
							<button class="btn btn-danger btn-sm" use:armed>
								{t(deleteConfirm)}
							</button>
						</form>
					{:else}
						<button
							title={t(deleteTitle)}
							aria-label={t(deleteTitle)}
							onclick={() => (confirmDelete = tag.id)}
							class="icon-btn icon-btn-danger"
						>
							<Icon name="trash" />
						</button>
					{/if}
				{/if}
			</div>

			{#if shown(tag.id)}
				<!-- A line of its own under the chip, in the order a notebook's own
				     tabs run, so the list and the tabs agree about what is in there. -->
				<p class="tag-breakdown" class:has-rail={rail}>
					{#each tag.by as use (use.kind)}
						<span class="tabular">{t(USE_LABELS[use.kind], { count: use.count })}</span>
					{/each}
				</p>
			{/if}
		</div>
	{/each}
</div>

<style>
	/* The count's right edge is the verbs' left edge, so the column is straight. */
	.tag-uses {
		justify-content: flex-end;
		white-space: nowrap;
	}

	.tag-breakdown {
		display: flex;
		flex-basis: 100%;
		flex-wrap: wrap;
		column-gap: 0.75rem;
		row-gap: 0.25rem;
		font-size: var(--text-xs);
		color: var(--color-gray-500);
	}

	.tag-breakdown.has-rail {
		padding-inline-start: calc(var(--row-rail) + var(--row-gap));
	}
</style>
