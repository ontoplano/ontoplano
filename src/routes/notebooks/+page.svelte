<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import SplitColumns from '$lib/components/SplitColumns.svelte';
	import { NOTEBOOK_PANEL_MIN } from '$lib/services/settings';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MarkdownImport from '$lib/components/MarkdownImport.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import { autofocus } from '$lib/actions/autofocus';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import NotebookTags from '$lib/components/NotebookTags.svelte';
	import NotebookFields from '$lib/components/fields/NotebookFields.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import NotebookCover from '$lib/components/NotebookCover.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
	import {
		allFolders,
		folderSegments,
		parentFolder,
		shelfOf,
		MAX_FOLDER_LENGTH,
		FOLDER_SEPARATOR,
		type ShelfFolder
	} from '$lib/notebook-path';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Notebook = PageServerData['notebooks'][number];

	/** Whether the markdown importer is open. Closed until asked for. */

	let showForm = $state(false);
	/** The labels on what is filed in the notebook showing — see `NotebookTags`. */
	let managingTags = $state(false);
	let editingId = $state<number | null>(null);
	/** Whether the note composer in the panel is open; the button for it is up here. */
	let composing = $state(false);
	/*
	 * How wide the list of notebooks is. The drag lives in `SplitColumns`; what
	 * is here is where the width is written down, once, when the handle is let
	 * go rather than on every pixel of it.
	 */
	// The seed, read once; from here the handle owns it and the load only
	// supplies where it was last left.
	// svelte-ignore state_referenced_locally
	let panelRem = $state(data.listPanelRem);
	let panelForm = $state<HTMLFormElement>();
	/** The New button for whichever tab the panel is showing — see NotebookDetail. */
	let newAction = $state<{ label: string; run?: () => void; href?: string } | undefined>(undefined);
	/** The Link button beside it — see NotebookDetail. */
	let linkAction = $state<{ label: string; run: () => void } | undefined>(undefined);

	const editing = $derived(
		editingId ? (data.notebooks.find((n) => n.id === editingId) ?? null) : null
	);
	const selected = $derived(data.notebooks.find((n) => n.id === data.selected) ?? null);

	/**
	 * Which folders are open, by path. Closed is the resting state, as in the
	 * gallery — except the ones the chosen notebook is in, which start open so
	 * what the panel shows is on the shelf beside it.
	 */
	const opened = new SvelteSet<string>(
		untrack(() => {
			const parts = folderSegments(selected?.folder ?? '');
			return parts.map((_, at) => parts.slice(0, at + 1).join(FOLDER_SEPARATOR));
		})
	);
	const toggle = (path: string) => {
		if (opened.has(path)) opened.delete(path);
		else opened.add(path);
	};

	/** The folder being renamed, by the path it has now, and its dialog. */
	let renamingFolder = $state<string | null>(null);
	let renameOpen = $state(false);
	const folderSuggestions = $derived(allFolders(data.notebooks));

	function openRename(path: string) {
		renamingFolder = path;
		renameOpen = true;
	}

	/** Every notebook in a folder, at any depth — what its tile shows. */
	function insideOf(folder: ShelfFolder<Notebook>): Notebook[] {
		return [...folder.notebooks, ...folder.folders.flatMap(insideOf)];
	}

	const orphaned = $derived(data.orphaned);

	/**
	 * The shelf, with the closed ones at the end.
	 *
	 * A closed notebook is a finished subject: it is kept, and it is not what
	 * somebody is looking for. Sorted here rather than on the server because
	 * the order is about how the shelf reads, and the tree the server builds is
	 * about what is inside what — two different questions.
	 */
	const shelved = $derived(shelfOf(data.notebooks.filter((one) => !one.closedAt)));

	/*
	 * The ones that are finished with, folded away.
	 *
	 * A closed notebook is history — a trip that happened, a renovation that
	 * ended — and it was sitting on the same shelf as the ones being written
	 * in, only greyer. They are behind a line now, closed to begin with,
	 * because the shelf is for what you are working on.
	 */
	const closedOnes = $derived(data.notebooks.filter((one) => Boolean(one.closedAt)));
	const closed = $derived(shelfOf(closedOnes));
	let showClosed = $state(false);
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
			renameOpen = false;
			return;
		}
		if (getAction('/notebooks', e.key) === 'new') {
			e.preventDefault();
			openCreate();
		}
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
	<!-- The heading and the tabs are the layout's — see `TabbedRoom`. -->
	<FormError message={form?.message} />

	<!--
		`minmax(0, 1fr)` at this width too, not only at `lg`.
		
		A grid item's default `min-width` is its own content, and below `lg` the
		panel on the right is a `display: contents` wrapper — so the card itself
		became the grid item, refused to shrink below the width of its header, and
		grew to 466px inside a 358px column. The card clips rather than scrolls, so
		what went past the edge was simply gone: the Delete button, on a phone,
		with no way to reach it.
	-->
	<!--
		The list and what it opens are one object, not two.

		They were two cards on the page's own ground with the backdrop showing
		between them, which drew them as two views that happen to sit side by
		side. They are one room: the panel chooses and the column beside it
		shows, so the divider between them is a seam in one surface — the same
		shape inventory's places and its things have. `pane` is what takes each
		card's own edge away; the border and the section's accent belong to both
		of them, drawn once around the pair rather than once each.
	-->
	<!-- The room's colour down the side, the same as every other tab in it: the
	     shelf was the one page here standing on a card with no accent. -->
	<div
		class="card-accent border border-gray-200 bg-white shadow-card"
		style="--card-accent: {SECTION_COLORS.diary}"
	>
		<!-- The shelf's own floor: one cover wide. A list of names cannot go this
		     narrow and a grid of covers can — see `NOTEBOOK_PANEL_MIN`. -->
		<SplitColumns
			bind:rem={panelRem}
			min={NOTEBOOK_PANEL_MIN}
			label={t('notebooks.widenOrNarrowTheList')}
			onsettle={() => panelForm?.requestSubmit()}
		>
			{#snippet left()}
				<Card flush pane>
					{#if data.notebooks.length === 0}
						<EmptyState
							icon="notebook"
							title={t('notebooks.noNotebooksYet')}
							description={t('notebooks.startOneForSomethingYou')}
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
							Folders group notebooks.

							A folder is a path a notebook carries, `Home/Kitchen`, and only a
							label: it holds nothing of its own and is not a notebook. It is
							drawn as a tile on the shelf that opens in place, and renaming it
							rewrites the path of every notebook in it.
						-->
						<!--
							A notebook is its cover.

							They were rows with a stamp of a picture at the front, which is a
							list of names with a decoration; a shelf of subjects is a shelf of
							things, and you pick one the way you pick a book — by looking at
							it. The picture is the object and the name hangs under it, glued
							on rather than beside it.
						-->
						{#snippet cover(node: Notebook)}
							<NotebookCover
								notebook={node}
								href="{resolve('/notebooks')}?notebook={node.id}"
								chosen={node.id === data.selected}
							>
								{#snippet actions()}
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
											title={node.closedAt ? t('notebooks.reopenIt') : t('notebooks.closeIt')}
											aria-label="{node.closedAt
												? t('notebooks.reopenIt')
												: t('notebooks.closeIt')} {node.title}"
										>
											{#if node.closedAt}
												<Icon name="undo" />
											{:else}
												<Icon name="check" />
											{/if}
										</button>
									</form>
								{/snippet}
							</NotebookCover>
						{/snippet}

						<!--
							An open folder and what is inside it are one block.

							They were flat siblings on one shelf with the contents nudged a
							little to the right, so opening a folder produced covers that
							belonged to it and looked like more of the shelf — the indent is
							a few pixels and the eye does not count pixels. A ground behind
							the pair says it instead: the folder and its contents sit on one
							tint, and a folder inside that one gets a tint of its own.
						-->
						{#snippet folderTile(folder: ShelfFolder<Notebook>)}
							{@const open = opened.has(folder.path)}
							{@const shown = insideOf(folder).slice(0, 4)}
							<div class="notebook-cover">
								<button
									type="button"
									class="cover-face w-full text-left"
									aria-expanded={open}
									aria-label={t('notebooks.whatIsInside', {
										show: open ? t('ui.hide') : t('ui.show'),
										title: folder.name
									})}
									onclick={() => toggle(folder.path)}
								>
									<!-- The folder wears what is in it: up to four of its covers. -->
									<span class="cover-art cover-folder" data-shows={shown.length} aria-hidden="true">
										{#each shown as one (one.id)}
											{#if one.pictureId}
												<img src="/media/{one.pictureId}" alt="" loading="lazy" />
											{:else}
												<span></span>
											{/if}
										{/each}
									</span>
									<span class="cover-name flex items-center gap-1">
										<Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
										<span class="min-w-0">{folder.name}</span>
									</span>
									<span class="cover-tally">
										{t('notebooks.folderNotebooksCount', { count: folder.count })}
									</span>
								</button>
								<div class="cover-actions">
									<button
										type="button"
										class="icon-btn"
										title={t('notebooks.renameFolder')}
										aria-label={t('notebooks.renameFolderNamed', { name: folder.path })}
										onclick={() => openRename(folder.path)}
									>
										<Icon name="edit" />
									</button>
								</div>
							</div>
						{/snippet}

						{#snippet folderRow(folder: ShelfFolder<Notebook>)}
							{#if opened.has(folder.path)}
								<div class="notebook-family" data-folder={folder.path}>
									{@render folderTile(folder)}
									{@render shelfContents(folder)}
								</div>
							{:else}
								{@render folderTile(folder)}
							{/if}
						{/snippet}

						{#snippet shelfContents(level: {
							folders: ShelfFolder<Notebook>[];
							notebooks: Notebook[];
						})}
							{#each level.folders as folder (folder.path)}
								{@render folderRow(folder)}
							{/each}
							{#each level.notebooks as node (node.id)}
								{@render cover(node)}
							{/each}
						{/snippet}

						<div data-tour="notebook-shelf" class="notebook-shelf">
							{@render shelfContents(shelved)}
						</div>

						{#if closedOnes.length > 0}
							<!--
								The line under the shelf, and what is behind it.

								Pressing the line is what opens it — the rule and its label
								are one control, so there is nothing to hunt for and nothing
								drawn that is not the thing itself.
							-->
							<button
								type="button"
								class="shelf-fold"
								onclick={() => (showClosed = !showClosed)}
								aria-expanded={showClosed}
							>
								<span class="shelf-fold-line" aria-hidden="true"></span>
								<span class="shelf-fold-label">
									<Icon name={showClosed ? 'chevron-down' : 'chevron-right'} size={14} />
									{t('notebooks.closedCount', { count: closedOnes.length })}
								</span>
								<span class="shelf-fold-line" aria-hidden="true"></span>
							</button>

							{#if showClosed}
								<div class="notebook-shelf">
									{@render shelfContents(closed)}
								</div>
							{/if}
						{/if}

						<!--
							What is left over, as a bin in the corner.

							Notes whose notebook was deleted are not a notebook, and a row
							of them at the end of the shelf read as one — a book on the
							shelf called "Notes without a notebook". It is a small thing
							pinned to the bottom corner of the panel, where a bin goes.
						-->
						{#if orphaned.length > 0}
							<a
								href="{resolve('/notebooks')}?notebook=orphaned"
								class="shelf-bin {showingOrphans ? 'is-chosen' : ''}"
								title={t('notebooks.theirNotebookWas', {
									length: orphaned.length,
									notes: orphaned.length === 1 ? 'note' : 'notes'
								})}
								aria-label={t('notebooks.notesWithoutANotebook')}
							>
								<Icon name="recycle" size={16} />
								<span class="tabular text-xs">{orphaned.length}</span>
							</a>
						{/if}
					{/if}
				</Card>
			{/snippet}

			<!--
				The second column is the one you picked, and on a phone there is no
				second column — there is what is under your thumb. An account with
				nothing in it showed "no notebooks yet" and then, under it, two more
				panels saying nothing was chosen.
			-->
			{#snippet right()}
				<div class:hidden={!selected && !showingOrphans} class="contents lg:!block">
					<Card
						title={showingOrphans
							? t('notebooks.notesWithoutANotebook')
							: (selected?.title ?? t('notebookDetail.nothingChosen'))}
						description={showingOrphans
							? t('notebooks.theirNotebookWasDeletedThe')
							: selected
								? (selected.description ?? '')
								: t('notebooks.pickANotebookToSee')}
						foldDescription={!!selected && !showingOrphans}
						flush
						pane
					>
						{#snippet lead()}
							<!-- The notebook's own picture, beside its name — and pressing it
							     is how you change it, the same control the shelf and the two
							     Edit notebook dialogues use. -->
							{#if selected && !showingOrphans}
								<NotebookPicture
									notebook={selected}
									kilobytes={data.pictureKilobytes}
									size="size-16"
									onpress={() => openEdit(selected)}
								/>
							{/if}
						{/snippet}
						{#snippet titleActions()}
							{#if selected}
								<!-- The way to the notebook's own page, beside its name. -->
								<a
									href={resolve('/notebooks/[id]', { id: String(selected.id) })}
									class="btn btn-sm"
									title={t('ui.open')}
									aria-label={t('ui.open')}
								>
									<span class="hidden sm:inline">{t('ui.open')}</span>
									<Icon name="arrow-right" />
								</a>
								<!-- This subject's own words, rather than the whole account's. -->
								<button
									onclick={() => (managingTags = true)}
									class="btn btn-sm"
									title={t('tags.manageTags')}
									aria-label={t('tags.manageTags')}
								>
									<Icon name="tag" />
									<span class="hidden sm:inline">{t('tags.manageTags')}</span>
								</button>
							{/if}
						{/snippet}
						{#snippet actions()}
							{#if selected}
								<!--
									Filling the notebook: the two ways to put something in it,
									with the primary verb at the end where a hand comes from.
									Leaving it — its labels and its own page — sits by the name.
								-->
								<div class="flex flex-col items-end gap-2">
									<div class="flex flex-wrap items-center justify-end gap-2">
										{#if linkAction}
											<!-- The other way to fill a tab: take something that is
											     already there. See `LinkIntoNotebook`. -->
											<button onclick={linkAction.run} class="btn btn-sm">
												<Icon name="link" />
												{linkAction.label}
											</button>
										{/if}
										<!--
											Writing, where deleting the whole notebook used to be.

											This is a page for browsing notebooks, and the thing most
											often wanted from one on screen is another note in it —
											not destroying it, one press away, beside a list you are
											moving through. Deleting a notebook is on the notebook's
											own page, which is a place you go to on purpose.

											What it says follows the tab below it: it read "New note"
											while the Tasks tab was showing, which is a button
											offering the wrong thing about the list under it.
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
									</div>
								</div>
							{/if}
						{/snippet}

						<NotebookDetail
							notebook={selected}
							contents={data.contents}
							{orphaned}
							{showingOrphans}
							allPeople={data.allPeople}
							categories={data.categories}
							inventoryCategories={data.inventoryCategories}
							workoutCategories={data.workoutCategories}
							parsers={data.parsers}
							currency={data.currency}
							pickableNotebooks={data.pickableNotebooks}
							areas={data.areas}
							workoutMeasures={data.workoutMeasures}
							slots={data.slots}
							todos={data.todos}
							allTodos={data.allTodos}
							activities={data.activities}
							bind:composing
							bind:newAction
							bind:linkAction
						/>
					</Card>
				</div>
			{/snippet}
		</SplitColumns>
	</div>

	<form
		method="POST"
		action="?/setPanelWidth"
		class="hidden"
		bind:this={panelForm}
		use:enhance={() => async () => {}}
	>
		<input type="hidden" name="rem" value={panelRem} />
	</form>
</div>

<NotebookTags
	bind:open={managingTags}
	title={selected?.title ?? ''}
	tags={data.notebookTags}
	action="?/saveTag"
	error={form?.message ?? null}
/>

<Modal
	bind:open={showForm}
	error={form?.message}
	onclose={() => (editingId = null)}
	title={editingId ? t('notebooks.id.editNotebook') : t('notebooks.newNotebook')}
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

		<NotebookFields
			title={editing?.title ?? ''}
			folder={editing?.folder ?? ''}
			description={editing?.description ?? ''}
			defaultTags={editing?.defaultTags ?? ''}
			notebook={editing}
			notebooks={data.notebooks}
			pictureKilobytes={data.pictureKilobytes}
		/>
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
			{editingId ? t('ui.save') : t('notebooks.createNotebook')}
		</button>
	{/snippet}
</Modal>

<!--
	Renaming a folder is rewriting a path.

	A folder has no row, so its name is the prefix every notebook in it
	carries: changing it here moves all of them, and a path under a different
	folder moves it there. Removing one moves its notebooks up a level — no
	notebook is deleted, so it asks nothing twice.
-->
<Modal
	bind:open={renameOpen}
	error={form?.message}
	onclose={() => (renamingFolder = null)}
	title={t('notebooks.renameFolder')}
	size="sm"
>
	<form
		id="folder-form"
		method="post"
		action="?/renameFolder"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') renameOpen = false;
			}}
	>
		<input type="hidden" name="from" value={renamingFolder ?? ''} />
		<FormGrid>
			<Field label={t('notebooks.folderPath')} span={12} hint={t('notebooks.folderPathHint')}>
				<input
					name="to"
					value={renamingFolder ?? ''}
					list="shelf-folders"
					maxlength={MAX_FOLDER_LENGTH}
					class="input"
					use:autofocus
				/>
				<datalist id="shelf-folders">
					{#each folderSuggestions as one (one)}
						<option value={one}></option>
					{/each}
				</datalist>
			</Field>
		</FormGrid>
	</form>
	<form
		id="folder-remove-form"
		method="post"
		action="?/renameFolder"
		class="hidden"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') renameOpen = false;
			}}
	>
		<input type="hidden" name="from" value={renamingFolder ?? ''} />
		<input type="hidden" name="to" value={parentFolder(renamingFolder ?? '')} />
	</form>

	{#snippet footer()}
		<button
			type="submit"
			form="folder-remove-form"
			class="btn mr-auto"
			title={t('notebooks.removeFolderMovesUp')}
		>
			{t('notebooks.removeFolder')}
		</button>
		<button type="button" class="btn" onclick={() => (renameOpen = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="folder-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>
