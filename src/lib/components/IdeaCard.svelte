<script lang="ts">
	/**
	 * One idea, wherever an idea is shown.
	 *
	 * This was written inside the Ideas page, so a notebook's Ideas tab drew an
	 * idea a second way: a line of text with a tick beside it, next to a room
	 * where the same idea is a card with its star, its tags, the note saying
	 * what was applied, and its verbs. The same thing in
	 * two shapes is the drift `GoalCard` was pulled out to stop, and this is
	 * the same move for the same reason.
	 *
	 * Where it posts is a prop (`$lib/idea-action-names`), because a notebook
	 * page answers to `delete` for the notebook itself; what it posts to is the
	 * same handler either way (`$lib/services/idea-actions`).
	 */
	import Icon from '$lib/components/Icon.svelte';
	import RowCard from '$lib/components/RowCard.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import SelectBox from '$lib/components/SelectBox.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import Written from '$lib/components/Written.svelte';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { momentOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import type { IdeaActionNames } from '$lib/idea-action-names';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** What a card needs off an idea — `listIdeas` gives exactly this. */
	type Shown = {
		id: number;
		content: string;
		isApplied: boolean;
		appliedNote: string | null;
		favorite: boolean;
		createdAt: string;
		updatedAt: string;
		tags: { id: number; name: string }[];
	};

	let {
		idea,
		actions,
		/**
		 * Whether this is the one under the cursor.
		 *
		 * The applied note only unfolds on the chosen card: a list of twenty
		 * ideas with every note open is the notes rather than the ideas.
		 */
		selected = false,
		/** Pressing a tag filters by it, where the screen has a filter. */
		ontag,
		onedit,
		/**
		 * Choosing several at once: the rail holds the box instead of the star,
		 * and the row's own verbs step back — see `SelectionBar`.
		 */
		selecting = false,
		chosen = false,
		ontoggle
	}: {
		idea: Shown;
		actions: IdeaActionNames;
		selected?: boolean;
		ontag?: (name: string) => void;
		onedit?: (id: number) => void;
		selecting?: boolean;
		chosen?: boolean;
		ontoggle?: () => void;
	} = $props();

	let editingNote = $state(false);
	let noteDraft = $state('');
	let confirmingDelete = $state(false);

	function startNoteEdit() {
		noteDraft = idea.appliedNote ?? '';
		editingNote = true;
	}

	function formatDate(iso: string): string {
		return momentOf(iso, now());
	}

	/** When, whether applied, and when last changed — one line, one separator. */
	const meta = $derived(
		[
			formatDate(idea.createdAt),
			idea.isApplied ? t('notebooks.ideas.applied2') : '',
			idea.updatedAt !== idea.createdAt
				? t('notebooks.ideas.edited', { updatedAt: formatDate(idea.updatedAt) })
				: ''
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<!--
	The card a task is drawn on — `RowCard`: the star where a task has its tick,
	the words beside it, the tags and the verbs along the foot. The row around
	it keeps the padding and the cursor.
-->
<div class="row-card" class:bg-gray-100={selecting && chosen}>
	<RowCard quiet={selecting}>
		{#snippet rail()}
			{#if selecting}
				<SelectBox
					checked={chosen}
					label={t('notebooks.ideas.selectIdea', { title: idea.content.slice(0, 60) })}
					ontoggle={() => ontoggle?.()}
				/>
			{:else}
				<form
					method="post"
					action={actions.toggleFavorite}
					data-favorite-toggle-id={idea.id}
					use:enhance
				>
					<input type="hidden" name="id" value={idea.id} />
					<!-- The star a notebook wears on the shelf: the same outline, filled
				     when it is on, so pressing it does not change its size. -->
					<button
						type="submit"
						class="icon-btn idea-star"
						class:is-on={idea.favorite}
						aria-pressed={idea.favorite}
						title={idea.favorite
							? t('notebooks.ideas.removeFavorite')
							: t('notebooks.ideas.markAsFavorite')}
						aria-label={idea.favorite
							? t('notebooks.ideas.removeFavorite')
							: t('notebooks.ideas.markAsFavorite')}
					>
						<Icon name="star" />
					</button>
				</form>
			{/if}
		{/snippet}

		{#snippet labels()}
			{#each idea.tags as tag (tag.id)}
				<TagChip name={tag.name} onclick={ontag ? () => ontag(tag.name) : undefined} />
			{/each}
		{/snippet}

		{#snippet controls()}
			{#if confirmingDelete}
				<form
					data-leaves
					method="post"
					action={actions.remove}
					use:enhance={() => {
						return async ({ update }) => {
							await update({ reset: false });
							confirmingDelete = false;
						};
					}}
				>
					<input type="hidden" name="id" value={idea.id} />
					<button type="submit" class="btn btn-sm btn-danger" use:armed>
						{t('notebooks.ideas.confirm')}
					</button>
				</form>
				<button type="button" onclick={() => (confirmingDelete = false)} class="btn btn-sm">
					{t('ui.cancel')}
				</button>
			{:else}
				<form
					method="post"
					action={actions.toggleApplied}
					data-applied-toggle-id={idea.id}
					use:enhance={() => {
						return async ({ update }) => {
							await update({ reset: false });
							editingNote = false;
							noteDraft = '';
						};
					}}
				>
					<input type="hidden" name="id" value={idea.id} />
					<button
						type="submit"
						title={idea.isApplied
							? t('notebooks.ideas.appliedUndo')
							: t('notebooks.ideas.markApplied')}
						aria-label={idea.isApplied
							? t('notebooks.ideas.appliedUndo')
							: t('notebooks.ideas.markApplied')}
						aria-pressed={idea.isApplied}
						class="icon-btn"
					>
						<Icon name="check" />
					</button>
				</form>

				<button
					type="button"
					title={t('ui.edit')}
					aria-label={t('ui.edit')}
					onclick={() => onedit?.(idea.id)}
					class="icon-btn"
				>
					<Icon name="edit" />
				</button>

				<button
					title={t('ui.delete')}
					aria-label={t('ui.delete')}
					type="button"
					onclick={() => (confirmingDelete = true)}
					class="icon-btn icon-btn-danger"
				>
					<Icon name="trash" />
				</button>
			{/if}
		{/snippet}

		<!-- The idea is its own title: the weight a task's or a note's title has. -->
		<Written content={idea.content} class="font-medium" />

		<!-- When it was written, and whether it was applied: the line a task's
		     notebook sits on. -->
		<span class="tabular mt-0.5 text-xs text-gray-500">{meta}</span>

		{#if idea.isApplied && selected}
			<div class="mt-3 border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<div class="eyebrow text-gray-600">
							{t('notebooks.ideas.appliedNote')}
						</div>
						{#if editingNote}
							<form
								method="post"
								action={actions.updateAppliedNote}
								use:enhance={() => {
									return async ({ update }) => {
										await update({ reset: false });
										editingNote = false;
										noteDraft = '';
									};
								}}
								class="mt-2 flex items-center gap-2"
							>
								<input type="hidden" name="id" value={idea.id} />
								<OneLine
									name="appliedNote"
									placeholder={t('notebooks.ideas.whatDidYouApply')}
									bind:value={noteDraft}
									class="input input-sm min-w-0 flex-1"
									autofocus
								/>
								<button type="submit" class="btn btn-primary btn-sm">{t('ui.save')}</button>
								<button
									type="button"
									onclick={() => {
										editingNote = false;
										noteDraft = '';
									}}
									class="btn btn-sm"
								>
									{t('ui.cancel')}
								</button>
							</form>
						{:else}
							<p class="mt-1 text-sm whitespace-pre-wrap text-gray-900">
								{idea.appliedNote || t('notebooks.ideas.noAppliedNoteYet')}
							</p>
						{/if}
					</div>

					{#if !editingNote}
						<button
							type="button"
							onclick={startNoteEdit}
							class="icon-btn shrink-0"
							title={idea.appliedNote ? t('notebooks.ideas.editNote') : t('notebookDetail.addNote')}
							aria-label={idea.appliedNote
								? t('notebooks.ideas.editNote')
								: t('notebookDetail.addNote')}
						>
							<Icon name={idea.appliedNote ? 'edit' : 'plus'} />
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</RowCard>
</div>

<style>
	/* Filled when it is on, like a notebook's star on the shelf. */
	.idea-star.is-on :global(path) {
		fill: currentColor;
	}

	/* The fill is the pressed state: no square appearing behind it, so the
	   control keeps its shape either way. */
	.idea-star[aria-pressed='true'] {
		background-color: transparent;
		box-shadow: none;
	}
</style>
