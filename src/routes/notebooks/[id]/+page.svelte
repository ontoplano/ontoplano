<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { enhance } from '$lib/enhance';
	import FoldedText from '$lib/components/FoldedText.svelte';
	import DetailHeader from '$lib/components/DetailHeader.svelte';
	import { resolve } from '$app/paths';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookFields from '$lib/components/fields/NotebookFields.svelte';
	import NotebookTags from '$lib/components/NotebookTags.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import NotebookDelete from '$lib/components/NotebookDelete.svelte';
	import NotebookStar from '$lib/components/NotebookStar.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state(false);
	/** The labels on what is filed here — see `NotebookTags`. */
	let managingTags = $state(false);

	/** The New button for whichever tab is showing — see NotebookDetail. */
	let newAction = $state<{ label: string; run?: () => void; href?: string } | undefined>(undefined);
	/** The Link button beside it — see NotebookDetail. */
	let linkAction = $state<{ label: string; run: () => void } | undefined>(undefined);
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

<!--
	The picture, where somebody looks when they want to change it — drawn by the
	same component the two Edit notebook dialogues use, so there is one of it
	rather than three. Only for a notebook of your own: one shared into the
	family is somebody else's to dress.
-->
{#snippet picture()}
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
{/snippet}

<div class="space-y-4">
	<!--
		The header and the tabs under it are one card, with one stripe.

		They were two bordered cards with a gap between them, so the accent down
		the side belonged to the lower one and the rule started half way down the
		page — under the title it was supposed to be colouring. One surface, one
		edge: the header is a pane of it and so is everything below.
	-->
	<Card flush accent={SECTION_COLORS.diary} class="min-w-0">
		<!--
		The header stands on a surface of its own.

		The title, the description and the picture sat straight on the page's
		patterned ground while everything below them — the tabs, the notes, the
		tasks — stood on white, so the one part naming what you are looking at
		was the one part with nothing under it. Same surface the panes below use,
		so the page reads as one thing.
	-->
		<DetailHeader
			surface
			pane
			title={data.notebook.title}
			back={{ href: resolve('/notebooks'), label: t('notebooks.id.larrAllNotebooks') }}
			lead={data.notebook.mine || data.notebook.pictureId ? picture : undefined}
		>
			{#snippet badges()}
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
			{/snippet}

			{#snippet meta()}
				{#if data.notebook.description}
					<!-- Folded when it is long: a description written properly pushed
				     the notes off a phone screen. See `FoldedText`. -->
					<FoldedText text={data.notebook.description} />
				{/if}
			{/snippet}

			{#snippet actions()}
				<!--
				The one thing this page is for, and it follows the tab below: New
				note while notes are showing, New task on Tasks, New goal on Goals.
				Drawn here rather than in the tab strip so the strip has the room
				its tabs need at 390px — see NotebookDetail's `newAction`.
			-->
				{#if linkAction}
					<!-- The other way to fill a tab: take something that is already
				     there. See `LinkIntoNotebook`.

				     Before the New button rather than after it: the primary verb
				     ends the row, so the button pressed most is the one nearest
				     the edge a hand comes from. -->
					<button onclick={linkAction.run} class="btn btn-sm">
						<Icon name="link" />
						{linkAction.label}
					</button>
				{/if}
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
				<!-- This subject's own words, rather than the whole account's: the
				     Tags tab used to sit in the room strip, answering a question
				     nobody has while they are looking at one notebook. -->
				<button
					onclick={() => (managingTags = true)}
					class="btn btn-sm"
					title={t('tags.manageTags')}
					aria-label={t('tags.manageTags')}
				>
					<Icon name="tag" />
				</button>
				<!-- The reader's own star, so a notebook shared with them can carry one. -->
				<NotebookStar notebook={data.notebook} kind="btn btn-sm" />
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
						<button
							class="btn btn-sm"
							aria-pressed={data.notebook.sharedWithFamily}
							title={data.notebook.sharedWithFamily
								? t('notebooks.id.stopSharing')
								: t('notebooks.id.shareWithFamily')}
							aria-label={data.notebook.sharedWithFamily
								? t('notebooks.id.stopSharing')
								: t('notebooks.id.shareWithFamily')}
						>
							<Icon name="user" />
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
						<button
							class="btn btn-sm"
							title={data.notebook.closedAt ? t('notebooks.id.reopen') : t('notebooks.id.close')}
							aria-label={data.notebook.closedAt
								? t('notebooks.id.reopen')
								: t('notebooks.id.close')}
						>
							<Icon name={data.notebook.closedAt ? 'undo' : 'check'} />
						</button>
					</form>
					<!-- Icons alone past the two that fill the notebook, so the row
					     holds on one line of a phone; each still says its word. -->
					<button
						onclick={() => (confirmingDelete = true)}
						class="btn btn-danger btn-sm"
						title={t('ui.delete')}
						aria-label={t('ui.delete')}
					>
						<Icon name="trash" />
					</button>
				{/if}
			{/snippet}
		</DetailHeader>

		<FormError message={form?.message} />

		<!--
		The whole width, which is the point of being here rather than on the index.

		`min-w-0` because it is a flex column: without it every child may be as
		wide as its widest unbreakable thing, and one `/api/v1/…` in a note made
		the whole card wider than the phone. The page clips rather than scrolls,
		so what that looked like was ordinary sentences with their right-hand
		ends missing.
	-->
		<section class="flex min-w-0 flex-col border-t border-gray-200">
			<NotebookDetail
				notebook={data.notebook}
				contents={data.contents}
				allPeople={data.allPeople}
				categories={data.categories}
				inventoryCategories={data.inventoryCategories}
				workoutCategories={data.workoutCategories}
				parsers={data.parsers}
				currency={data.currency}
				pickableNotebooks={data.pickableNotebooks}
				locations={data.locations}
				areas={data.areas}
				workoutMeasures={data.workoutMeasures}
				slots={data.slots}
				todos={data.todos}
				allTodos={data.allTodos}
				activities={data.activities}
				bind:newAction
				bind:linkAction
			/>
		</section>
	</Card>
</div>

<NotebookTags
	bind:open={managingTags}
	title={data.notebook.title}
	tags={data.notebookTags}
	action="?/saveTag"
	untagAction={`?/untagNotebook&notebook=${data.notebook.id}`}
	error={form?.message ?? null}
/>

<Modal bind:open={editing} error={form?.message} title={t('notebooks.id.editNotebook')}>
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
			folder={data.notebook.folder}
			description={data.notebook.description}
			defaultTags={data.notebook.defaultTags}
			categoryId={data.notebook.categoryId}
			categories={data.categories}
			notebook={data.notebook}
			notebooks={data.pickableNotebooks}
			pictureKilobytes={data.pictureKilobytes}
		/>
	</form>

	{#snippet footer()}
		<button
			type="button"
			class="icon-btn mr-auto"
			title={t('ui.delete')}
			aria-label={t('ui.delete')}
			onclick={() => (confirmingDelete = true)}
		>
			<Icon name="trash" />
		</button>
		<button type="button" class="btn" onclick={() => (editing = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="notebook-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<NotebookDelete
	bind:open={confirmingDelete}
	notebook={data.notebook}
	error={form?.message}
	ondeleted={() => (editing = false)}
/>
