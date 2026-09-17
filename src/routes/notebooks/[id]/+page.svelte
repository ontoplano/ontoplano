<script lang="ts">
	import { enhance } from '$app/forms';
	import OneLine from '$lib/components/OneLine.svelte';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state(false);
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
	<div class="flex flex-wrap items-start justify-between gap-3">
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
				<p class="mt-1 max-w-prose text-sm text-gray-500">{data.notebook.description}</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
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
		<FormGrid>
			<Field label={t('ui.title')} span={12} required>
				<OneLine name="heading" value={data.notebook.title} class="input" required />
			</Field>
			<Field label={t('notebooks.id.whatItIsFor')} span={12}>
				<textarea name="description" rows="2" class="textarea">{data.notebook.description}</textarea
				>
			</Field>
		</FormGrid>
	</form>

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
