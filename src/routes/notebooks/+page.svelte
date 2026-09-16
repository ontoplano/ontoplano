<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { NOTEBOOK_SEPARATOR } from '$lib/services/notebooks';
	import { getAction, keyFor } from '$lib/shortcuts';
	import OneLine from '$lib/components/OneLine.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MarkdownImport from '$lib/components/MarkdownImport.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Notebook = PageServerData['notebooks'][number];

	/** Whether the markdown importer is open. Closed until asked for. */

	let showForm = $state(false);
	let editingId = $state<number | null>(null);
	let confirmingDelete = $state(false);

	const editing = $derived(
		editingId ? (data.notebooks.find((n) => n.id === editingId) ?? null) : null
	);
	const selected = $derived(data.notebooks.find((n) => n.id === data.selected) ?? null);

	/** Which folders are open. Closed is the resting state, as in the gallery. */
	const opened = new SvelteSet<number>();
	const toggle = (id: number) => {
		if (opened.has(id)) opened.delete(id);
		else opened.add(id);
	};

	/** The name as it reads under its parent: the last part of the path. */
	const leafTitle = (title: string) => title.split(NOTEBOOK_SEPARATOR).at(-1) ?? title;
	const orphaned = $derived(data.orphaned);
	const showingOrphans = $derived(data.orphanedSelected && !selected);

	function openCreate() {
		editingId = null;
		showForm = true;
	}

	function openEdit(notebook: Notebook) {
		editingId = notebook.id;
		showForm = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			showForm = false;
			editingId = null;
			confirmingDelete = false;
			return;
		}
		if (getAction('/notebooks', e.key) === 'new') {
			e.preventDefault();
			openCreate();
		}
	}

	/**
	 * "12 notes · 3 tasks · 1 goal", with nothing said about what is empty.
	 *
	 * Notes, not entries: writing in a notebook is a note and writing in the
	 * diary is an entry, and the tab above this list already says so.
	 */
	function tally(n: Notebook): string {
		const parts: string[] = [];
		if (n.entries) parts.push(`${n.entries} ${n.entries === 1 ? 'note' : 'notes'}`);
		if (n.tasks) parts.push(`${n.tasks} ${n.tasks === 1 ? 'task' : 'tasks'}`);
		if (n.goals) parts.push(`${n.goals} ${n.goals === 1 ? 'goal' : 'goals'}`);
		return parts.join(' · ') || 'nothing in it yet';
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('notebooks.newNotebook'),
		tour: 'notebook-new',
		kbd: keyFor('/notebooks', 'new'),
		run: openCreate
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<!-- The heading is the layout's — Notes, with this tab lit. -->
	<RoomToolbar>
		{#snippet tools()}{/snippet}
	</RoomToolbar>
	<p class="page-intro">
		{t('notebooks.aSubjectYouWriteAgainst')}
	</p>

	<FormError message={form?.message} />

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
		<Card accent={SECTION_COLORS.diary} flush>
			{#if data.notebooks.length === 0}
				<EmptyState
					icon="notebook"
					title={t('notebooks.noNotebooksYet')}
					description="Start one for something you will keep coming back to, and point notes, tasks and goals at it."
				>
					{#snippet action()}
						<button onclick={openCreate} class="btn btn-primary">
							<Icon name="plus" />
							{t('notebooks.newNotebook')}
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<!--
					Notebooks belong to each other.

					A name with an em dash in it is a place: `Renovation — Kitchen`
					sits inside `Renovation`, the same reading the gallery gives an
					album and the same tree inventory draws for a location. Nothing
					to keep in step and nothing new to learn — renaming one moves it.
				-->
				{#snippet notebookRow(node: (typeof data.tree)[number])}
					<div
						class="flex items-center gap-3 py-3 pr-4 {node.id === data.selected
							? 'bg-gray-100'
							: ''}"
						style="padding-left: calc(1rem + {node.depth} * 1.6rem)"
					>
						{#if node.children.length > 0}
							<button
								class="icon-btn -ml-1 shrink-0"
								aria-label={t('notebooks.whatIsInside', {
									show: opened.has(node.id) ? 'Hide' : 'Show',
									title: node.title
								})}
								aria-expanded={opened.has(node.id)}
								onclick={() => toggle(node.id)}
							>
								<Icon name={opened.has(node.id) ? 'chevron-down' : 'chevron-right'} size={14} />
							</button>
						{:else}
							<span class="size-4 shrink-0"></span>
						{/if}

						<!--
							Picking a notebook fills the column beside it, which is what a
							two-column page is for. The full page is reached from that
							column (Open, above), where the thing it opens is.
						-->
						<a
							href="{resolve('/notebooks')}?notebook={node.id}"
							class="min-w-0 flex-1 text-sm text-gray-900 hover:underline"
						>
							<span class:text-gray-500={node.closedAt}>{leafTitle(node.title)}</span>
							{#if !node.mine}
								<span class="eyebrow ml-1 text-gray-500">{node.sharedBy}’s</span>
							{:else if node.sharedWithFamily}
								<span class="eyebrow ml-1 text-gray-500">{t('notebooks.family')}</span>
							{/if}
							{#if node.closedAt}
								<span class="eyebrow ml-2 text-gray-500">{t('notebooks.closed')}</span>
							{/if}
							<span class="block truncate text-xs text-gray-500">{tally(node)}</span>
						</a>

						<button
							onclick={() => openEdit(node)}
							class="icon-btn"
							aria-label={t('notebooks.edit', { title: node.title })}
						>
							<Icon name="edit" />
						</button>

						<form
							method="post"
							action="?/setClosed"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
								}}
						>
							<input type="hidden" name="id" value={node.id} />
							<input type="hidden" name="closed" value={node.closedAt ? 'false' : 'true'} />
							<button
								class="icon-btn"
								title={node.closedAt ? 'Reopen it' : 'Close it'}
								aria-label="{node.closedAt ? 'Reopen' : 'Close'} {node.title}"
							>
								{#if node.closedAt}
									<Icon name="undo" />
								{:else}
									<Icon name="check" />
								{/if}
							</button>
						</form>
					</div>

					{#if opened.has(node.id)}
						{#each node.children as child (child.id)}
							{@render notebookRow(child)}
						{/each}
					{/if}
				{/snippet}

				<div class="flex h-full flex-col divide-y divide-gray-200">
					{#each data.tree as node (node.id)}
						{@render notebookRow(node)}
					{/each}

					<!--
						A notebook of its own, and only when there is something in it. `mt-auto`
						pins it to the bottom of the card rather than to the end of the list:
						it is not one more notebook in the same sequence as the others.
					-->
					{#if orphaned.length > 0}
						<a
							href="{resolve('/notebooks')}?notebook=orphaned"
							class="mt-auto block px-4 py-3 text-sm hover:underline {showingOrphans
								? 'bg-gray-100'
								: ''}"
						>
							<span class="text-gray-900">{t('notebooks.notesWithoutANotebook')}</span>
							<span class="block truncate text-xs text-gray-500"
								>{t('notebooks.theirNotebookWas', {
									length: orphaned.length,
									notes: orphaned.length === 1 ? 'note' : 'notes'
								})}</span
							>
						</a>
					{/if}
				</div>
			{/if}
		</Card>

		<!--
			The second column is the one you picked, and on a phone there is no
			second column — there is what is under your thumb. An account with
			nothing in it showed "no notebooks yet" and then, under it, two more
			panels saying nothing was chosen.
		-->
		<div class:hidden={!selected && !showingOrphans} class="contents lg:!block">
			<Card
				title={showingOrphans ? 'Notes without a notebook' : (selected?.title ?? 'Nothing chosen')}
				description={showingOrphans
					? 'Their notebook was deleted. The writing was kept — it is not part of the journal, so it waits here.'
					: selected
						? (selected.description ?? '')
						: 'Pick a notebook to see everything that belongs to it.'}
				accent={SECTION_COLORS.diary}
				flush
			>
				{#snippet actions()}
					{#if selected}
						<!-- The way to the notebook's own page, from the column that is
					     showing it. The list on the left chooses what appears here. -->
						<a href={resolve('/notebooks/[id]', { id: String(selected.id) })} class="btn btn-sm">
							{t('ui.open')}
							<Icon name="arrow-right" />
						</a>
						<!-- The confirmation is a dialog, not a second button in the same
					     place: a two-step delete that puts "Yes" where "Delete" was is a
					     double-click away from destroying something. -->
						<button onclick={() => (confirmingDelete = true)} class="btn btn-danger btn-sm">
							<Icon name="trash" />
							{t('ui.delete')}
						</button>
					{/if}
				{/snippet}

				<NotebookDetail
					notebook={selected}
					contents={data.contents}
					{orphaned}
					{showingOrphans}
					allPeople={data.allPeople}
					categories={data.categories}
					pickableNotebooks={data.pickableNotebooks}
				/>
			</Card>
		</div>
	</div>
</div>

<Modal
	bind:open={showForm}
	error={form?.message}
	onclose={() => (editingId = null)}
	title={editingId ? 'Edit notebook' : 'New notebook'}
	size="sm"
>
	<form
		id="notebook-form"
		method="post"
		action={editingId ? '?/update' : '?/create'}
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: result.type === 'success' });
				if (result.type === 'success') {
					showForm = false;
					editingId = null;
				}
			}}
	>
		{#if editingId}
			<input type="hidden" name="id" value={editingId} />
		{/if}

		<FormGrid>
			<Field
				label={t('ui.title')}
				span={12}
				required
				hint="An em dash makes a folder: “Renovation — Kitchen” sits inside “Renovation”."
			>
				<OneLine
					name="heading"
					placeholder={t('notebooks.kitchenRenovation')}
					value={editing?.title ?? ''}
					class="input"
					required
				/>
			</Field>

			<Field label={t('notebooks.whatItIsFor')} span={12}>
				<textarea name="description" rows="3" class="textarea"
					>{editing?.description ?? ''}</textarea
				>
			</Field>
		</FormGrid>
	</form>

	<!--
		The other way to make one: bring a folder of markdown in.
		
		It was a button on the room's toolbar and a card of its own that pushed
		the list down the page — a second, permanent thing to read on a screen
		whose first job is the notebooks somebody already has. It belongs here:
		this is the dialogue for "a new notebook", and importing is one, made
		out of files instead of typed.
		
		Not while editing: there is nothing to import into an existing one.
	-->
	{#if !editingId}
		<details class="mt-4 border-t border-gray-200 pt-3">
			<summary class="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
				{t('notebooks.orImportAFolderOf')}
			</summary>
			<p class="mt-2 text-sm leading-relaxed text-gray-500">
				{t('notebooks.each')} <code class="text-xs">{t('notebooks.md')}</code>
				{t('notebooks.fileBecomesANoteIn')} <code class="text-xs">{t('notebooks.tags')}</code>
				{t('notebooks.andFromTheFrontmatter')}
			</p>
			<div class="mt-3">
				<MarkdownImport
					compact
					enhancer={(node) =>
						enhance(node, () => async ({ update, result }) => {
							// Not reset: the dialogue is about to close, and blanking a
							// form on its way out is a flash of empty fields nobody asked
							// to see. `forms-do-not-blank.test.ts` is what noticed.
							await update({ reset: false });
							if (result.type === 'success') showForm = false;
						})}
				/>
			</div>
		</details>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="notebook-form" class="btn btn-primary">
			{editingId ? 'Save' : 'Create notebook'}
		</button>
	{/snippet}
</Modal>

<!--
	Deleting a notebook, at arm's length.

	The old confirmation replaced the Delete button with "Yes, delete" in the
	same pixels, so a double-click destroyed the notebook. A dialog puts the
	answer somewhere the cursor is not, and leaves room to say plainly what
	survives.
-->
<Modal
	bind:open={confirmingDelete}
	title={t('notebooks.deleteThisNotebook')}
	description={selected ? `“${selected.title}” will be gone.` : ''}
	size="sm"
>
	<p class="text-sm text-gray-600">
		{t('notebooks.itsNotesTasksAndGoals')}
		<strong class="font-medium text-gray-900">{t('notebooks.notesWithoutANotebook')}</strong>{t(
			'notebooks.atTheBottomOf'
		)}
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmingDelete = false)}
			>{t('ui.cancel')}</button
		>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				async ({ update }) => {
					confirmingDelete = false;
					await update();
				}}
		>
			<input type="hidden" name="id" value={selected?.id} />
			<button class="btn btn-danger" use:armed>{t('notebooks.deleteTheNotebook')}</button>
		</form>
	{/snippet}
</Modal>
