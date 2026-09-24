<script lang="ts">
	/**
	 * One idea, wherever an idea is shown.
	 *
	 * This was written inside the Ideas page, so a notebook's Ideas tab drew an
	 * idea a second way: a line of text with a tick beside it, next to a room
	 * where the same idea is a card with its star, its tags, the note saying
	 * what was applied, and the verbs up its right-hand edge. The same thing in
	 * two shapes is the drift `GoalCard` was pulled out to stop, and this is
	 * the same move for the same reason.
	 *
	 * Where it posts is a prop (`$lib/idea-action-names`), because a notebook
	 * page answers to `delete` for the notebook itself; what it posts to is the
	 * same handler either way (`$lib/services/idea-actions`).
	 */
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
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
		onedit
	}: {
		idea: Shown;
		actions: IdeaActionNames;
		selected?: boolean;
		ontag?: (name: string) => void;
		onedit?: (id: number) => void;
	} = $props();

	let editingNote = $state(false);
	let noteDraft = $state('');
	let confirmingDelete = $state(false);

	function startNoteEdit() {
		noteDraft = idea.appliedNote ?? '';
		editingNote = true;
	}

	function formatDate(iso: string): string {
		return momentOf(new Date(iso), now(), { weekday: 'short' });
	}
</script>

<div class="mb-2 flex items-start gap-4">
	<form method="post" action={actions.toggleFavorite} data-favorite-toggle-id={idea.id} use:enhance>
		<input type="hidden" name="id" value={idea.id} />
		<button
			type="submit"
			class="mt-0.5 text-lg leading-none transition {idea.favorite
				? 'text-amber-600 hover:text-amber-700'
				: 'text-gray-300 hover:text-amber-600'}"
			aria-label={idea.favorite
				? t('notebooks.ideas.removeFavorite')
				: t('notebooks.ideas.markAsFavorite')}
		>
			{idea.favorite ? '★' : '☆'}
		</button>
	</form>

	<div class="min-w-0 flex-1">
		<Written content={idea.content} />

		<!-- Date and tags wrap as one row. The buttons are not in here any
		     more: they are the column up the right-hand edge. -->
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs text-gray-500">{formatDate(idea.createdAt)}</span>
				{#if idea.isApplied}
					<span class="text-xs font-medium text-blue-700">{t('notebooks.ideas.applied2')}</span>
				{/if}
				{#if idea.updatedAt !== idea.createdAt}
					<span class="text-xs text-gray-500"
						>{t('notebooks.ideas.edited', { updatedAt: formatDate(idea.updatedAt) })}</span
					>
				{/if}
				{#if idea.tags.length > 0}
					<div class="flex flex-wrap gap-1">
						{#each idea.tags as tag (tag.id)}
							<TagChip name={tag.name} onclick={ontag ? () => ontag(tag.name) : undefined} />
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if idea.isApplied && selected}
			<div class="mt-3 border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<div class="text-xs font-medium tracking-wide text-blue-700 uppercase">
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
									class="min-w-0 flex-1 border border-blue-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-700 focus:ring-1 focus:ring-blue-700 focus:outline-none"
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
							<p class="mt-1 text-sm whitespace-pre-wrap text-blue-900">
								{idea.appliedNote || t('notebooks.ideas.noAppliedNoteYet')}
							</p>
						{/if}
					</div>

					{#if !editingNote}
						<button
							type="button"
							onclick={startNoteEdit}
							class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
						>
							{idea.appliedNote ? t('notebooks.ideas.editNote') : t('notebookDetail.addNote')}
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!--
		The card's actions, stacked up its right-hand edge: edit and the applied
		toggle at the top, delete as far from them as the card is tall. They used
		to be a row above the text, which squeezed it and put delete under the
		thumb.
	-->
	<div class="row-actions-stack">
		{#if confirmingDelete}
			<form
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
				<button
					type="submit"
					class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
					use:armed
				>
					{t('notebooks.ideas.confirm')}
				</button>
			</form>
			<button type="button" onclick={() => (confirmingDelete = false)} class="btn btn-sm">
				{t('ui.cancel')}
			</button>
		{:else}
			<button
				title={t('ui.edit')}
				aria-label={t('ui.edit')}
				onclick={() => onedit?.(idea.id)}
				class="icon-btn"
			>
				<Icon name="edit" />
			</button>

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
					class="icon-btn {idea.isApplied ? 'text-blue-700' : ''}"
				>
					<Icon name="check" />
				</button>
			</form>

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
	</div>
</div>
