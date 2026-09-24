<script lang="ts">
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
		onedit
	}: {
		tags: NotebookTag[];
		cursor?: number;
		deleteAction?: string;
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
</script>

<div class="divide-y divide-gray-200" data-tour="tag-list">
	{#each tags as tag, i (tag.id)}
		<div use:keepInView={cursor === i} class="list-row {cursor === i ? 'kbd-cursor' : ''}">
			<div class="list-row-main flex min-w-0 flex-col gap-1">
				<div class="flex min-w-0 flex-wrap items-center gap-3">
					<!-- The label as every other room draws it, so a colour is chosen
					     against the thing it will actually look like. -->
					<TagChip name={tag.name} color={tag.color} class="shrink-0" />

					<!--
						The count, and what is under it.

						A button rather than a number where there is something to open,
						and plain text where there is not: a control that does nothing
						is one somebody presses twice before deciding the app is broken.
					-->
					{#if tag.by.length > 0}
						<button
							type="button"
							class="min-w-0 text-left text-xs text-gray-500 hover:text-gray-900"
							aria-expanded={shown(tag.id)}
							aria-label={shown(tag.id)
								? t('tags.hideWhatCarriesIt', { tag: tag.name })
								: t('tags.showWhatCarriesIt', { tag: tag.name })}
							onclick={() => toggle(tag.id)}
						>
							<Icon name={shown(tag.id) ? 'chevron-down' : 'chevron-right'} size={12} />
							<span class="tabular">{tag.uses}</span>
							{tag.uses === 1
								? t('notebooks.tags.thingCarriesIt')
								: t('notebooks.tags.thingsCarryIt')}
						</button>
					{:else}
						<span class="min-w-0 text-xs text-gray-500">
							{t('tags.nothingCarriesItHere')}
						</span>
					{/if}
				</div>

				<!-- What the word means here, where there is an answer. `#short` on
				     the shopping and `#short` on a book are not the same idea. -->
				{#if tag.description}
					<p class="min-w-0 text-xs text-gray-500">{tag.description}</p>
				{/if}

				{#if shown(tag.id)}
					<!-- In the order a notebook's own tabs run, so the list and the
					     tabs agree about what is in there. -->
					<p class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
						{#each tag.by as use (use.kind)}
							<span class="tabular">{t(USE_LABELS[use.kind], { count: use.count })}</span>
						{/each}
					</p>
				{/if}
			</div>

			<div class="list-row-actions flex-none">
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
								{t('notebooks.tags.yesDelete')}
							</button>
						</form>
					{:else}
						<button
							title={t('ui.delete')}
							aria-label={t('ui.delete')}
							onclick={() => (confirmDelete = tag.id)}
							class="icon-btn icon-btn-danger"
						>
							<Icon name="trash" />
						</button>
					{/if}
				{/if}
			</div>
		</div>
	{/each}
</div>
