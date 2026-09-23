<script lang="ts">
	import { enhance } from '$lib/enhance';
	import FoldedText from '$lib/components/FoldedText.svelte';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookFields from '$lib/components/fields/NotebookFields.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state(false);

	/** The New button for whichever tab is showing — see NotebookDetail. */
	let newAction = $state<{ label: string; run?: () => void; href?: string } | undefined>(undefined);
	let confirmingDelete = $state(false);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			editing = false;
			confirmingDelete = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<!--
		The header stands on a surface of its own.

		The title, the description and the picture sat straight on the page's
		patterned ground while everything below them — the tabs, the notes, the
		tasks — stood on white, so the one part naming what you are looking at
		was the one part with nothing under it. Same surface the panes below use,
		so the page reads as one thing.
	-->
	<div
		class="flex flex-wrap items-start justify-between gap-3 border border-gray-200 bg-white p-3 shadow-card"
	>
		<!-- The picture and what it is a picture of, together: `justify-between`
		     put the whole width between them. -->
		<div class="flex min-w-0 items-start gap-3">
			<!--
			The picture, where somebody looks when they want to change it.

			The same arrangement a person has: one picture, and pressing it is how
			you set or replace it rather than hunting for a field in the edit form.
			Only for a notebook of your own — one shared into the family is
			somebody else's to dress.
		-->
			<!-- The picture, where somebody looks when they want to change it —
			     drawn by the same component the two Edit notebook dialogues use,
			     so there is one of it rather than three. -->
			{#if data.notebook.mine}
				<NotebookPicture notebook={data.notebook} kilobytes={data.pictureKilobytes} />
			{:else if data.notebook.pictureId}
				<img
					src="/media/{data.notebook.pictureId}"
					alt=""
					loading="lazy"
					class="size-12 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
				/>
			{/if}

			<div class="min-w-0">
				<a
					href={resolve('/notebooks')}
					class="text-xs text-gray-500 hover:text-gray-900 hover:underline"
				>
					{t('notebooks.id.larrAllNotebooks')}
				</a>
				<h1 class="mt-1 text-lg font-bold text-gray-900">
					{data.notebook.title}
					{#if data.notebook.closedAt}
						<span class="eyebrow ml-2 align-middle text-gray-500">{t('notebooks.id.closed')}</span>
					{/if}
					{#if !data.notebook.mine}
						<span class="eyebrow ml-2 align-middle text-gray-500"
							>{t('notebooks.id.sharedBy', { sharedBy: data.notebook.sharedBy ?? '' })}</span
						>
					{:else if data.notebook.sharedWithFamily}
						<span class="eyebrow ml-2 align-middle text-gray-500"
							>{t('notebooks.id.sharedWithFamily')}</span
						>
					{/if}
				</h1>
				{#if data.notebook.description}
					<!-- Folded when it is long: a description written properly pushed
				     the notes off a phone screen. See `FoldedText`. -->
					<FoldedText text={data.notebook.description} class="mt-1" />
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<!--
				The one thing this page is for, and it follows the tab below: New
				note while notes are showing, New task on Tasks, New goal on Goals.
				Drawn here rather than in the tab strip so the strip has the room
				its tabs need at 390px — see NotebookDetail's `newAction`.
			-->
			{#if newAction?.href}
				<!-- Already resolved: NotebookDetail builds this with `resolve()`. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={newAction.href} class="btn btn-sm btn-primary">
					<Icon name="plus" />
					{newAction.label}
				</a>
			{:else if newAction}
				<button onclick={newAction.run} class="btn btn-sm btn-primary">
					<Icon name="plus" />
					{newAction.label}
				</button>
			{/if}
			{#if data.notebook.mine && data.onFamilyPlan}
				<!-- The owner's switch: everybody on the plan reads it and writes
				     their own entries into it. Entries keep their writers. -->
				<form
					method="post"
					action="?/setShared"
					use:enhance={() =>
						async ({ update }) => {
							await update({ reset: false });
						}}
				>
					<input type="hidden" name="id" value={data.notebook.id} />
					<input
						type="hidden"
						name="shared"
						value={data.notebook.sharedWithFamily ? 'false' : 'true'}
					/>
					<button class="btn btn-sm">
						<Icon name="user" />
						{data.notebook.sharedWithFamily
							? t('notebooks.id.stopSharing')
							: t('notebooks.id.shareWithFamily')}
					</button>
				</form>
			{/if}
			{#if data.notebook.mine}
				<button
					onclick={() => (editing = true)}
					class="btn btn-sm"
					title={t('ui.rename')}
					aria-label={t('ui.rename')}><Icon name="edit" /></button
				>
				<form
					method="post"
					action="?/setClosed"
					use:enhance={() =>
						async ({ update }) => {
							await update({ reset: false });
						}}
				>
					<input type="hidden" name="id" value={data.notebook.id} />
					<input type="hidden" name="closed" value={data.notebook.closedAt ? 'false' : 'true'} />
					<button class="btn btn-sm">
						{#if data.notebook.closedAt}
							<Icon name="undo" /> {t('notebooks.id.reopen')}
						{:else}
							<Icon name="check" /> {t('notebooks.id.close')}
						{/if}
					</button>
				</form>
				<button onclick={() => (confirmingDelete = true)} class="btn btn-danger btn-sm">
					<Icon name="trash" />
					{t('ui.delete')}
				</button>
			{/if}
		</div>
	</div>

	<FormError message={form?.message} />

	<!--
		The whole width, which is the point of being here rather than on the index.

		`min-w-0` because it is a flex column: without it every child may be as
		wide as its widest unbreakable thing, and one `/api/v1/…` in a note made
		the whole card wider than the phone. The page clips rather than scrolls,
		so what that looked like was ordinary sentences with their right-hand
		ends missing.
	-->
	<section
		class="card-accent flex min-w-0 flex-col border border-gray-200 bg-white shadow-card"
		style="--card-accent: {SECTION_COLORS.diary}"
	>
		<NotebookDetail
			notebook={data.notebook}
			contents={data.contents}
			allPeople={data.allPeople}
			categories={data.categories}
			pickableNotebooks={data.pickableNotebooks}
			areas={data.areas}
			workoutMeasures={data.workoutMeasures}
			slots={data.slots}
			todos={data.todos}
			allTodos={data.allTodos}
			activities={data.activities}
			bind:newAction
		/>
	</section>
</div>

<Modal bind:open={editing} error={form?.message} title={t('notebooks.id.editNotebook')} size="sm">
	<form
		id="notebook-form"
		method="post"
		action="?/update"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') editing = false;
			}}
	>
		<input type="hidden" name="id" value={data.notebook.id} />
		<NotebookFields
			title={data.notebook.title}
			description={data.notebook.description}
			defaultTags={data.notebook.defaultTags}
		/>
	</form>

	<!-- Beside the form rather than in it: a picture goes up as multipart the
	     moment it is chosen, which is not the same submission as the words. -->
	{#if data.notebook.mine}
		<div class="mt-3 flex items-start gap-3 border-t border-gray-200 pt-3">
			<NotebookPicture notebook={data.notebook} kilobytes={data.pictureKilobytes} size="size-10" />
			<p class="text-sm text-gray-500">{t('notebooks.id.thePicture')}</p>
		</div>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="notebook-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<!-- The same dialog as the index: a confirmation somewhere the cursor is not. -->
<Modal
	bind:open={confirmingDelete}
	title={t('notebooks.id.deleteThisNotebook')}
	description={t('notebooks.id.titleWillBeGone', { title: data.notebook.title })}
	size="sm"
>
	<p class="text-sm text-gray-600">
		{t('notebooks.id.itsNotesTasksAndGoals')}
		<strong class="font-medium text-gray-900">{t('notebooks.id.notesWithoutANotebook')}</strong>{t(
			'notebooks.id.atTheBottomOf'
		)}
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmingDelete = false)}
			>{t('ui.cancel')}</button
		>
		<form method="post" action="?/delete" use:enhance>
			<input type="hidden" name="id" value={data.notebook.id} />
			<button class="btn btn-danger" use:armed>{t('notebooks.id.deleteTheNotebook')}</button>
		</form>
	{/snippet}
</Modal>
