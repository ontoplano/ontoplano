<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { NOTEBOOK_SEPARATOR } from '$lib/services/notebooks';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import SplitColumns from '$lib/components/SplitColumns.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MarkdownImport from '$lib/components/MarkdownImport.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import NotebookFields from '$lib/components/fields/NotebookFields.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Notebook = PageServerData['notebooks'][number];

	/** Whether the markdown importer is open. Closed until asked for. */

	let showForm = $state(false);
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
		if (n.entries) parts.push(t('notebooks.notesCount', { count: n.entries }));
		if (n.tasks) parts.push(t('notebooks.tasksCount', { count: n.tasks }));
		if (n.goals) parts.push(t('notebooks.goalsCount', { count: n.goals }));
		return parts.join(' · ') || t('notebooks.nothingInItYet');
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
	<!-- What a notebook is, for somebody who has none. Once there are some on
	     screen they say it better than the sentence does, and it is a paragraph
	     between the tabs and the thing you came for. -->
	{#if data.notebooks.length === 0}
		<p class="page-intro">
			{t('notebooks.aSubjectYouWriteAgainst')}
		</p>
	{/if}

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
	<div
		class="card-accent border border-gray-200 bg-white shadow-card"
		style="--card-accent: {SECTION_COLORS.diary};"
	>
		<SplitColumns
			bind:rem={panelRem}
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
							Notebooks belong to each other.

							A name with an em dash in it is a place: `Renovation — Kitchen`
							sits inside `Renovation`, the same reading the gallery gives an
							album and the same tree inventory draws for a location. Nothing
							to keep in step and nothing new to learn — renaming one moves it.
						-->
						{#snippet notebookRow(node: (typeof data.tree)[number])}
							<!--
								One row, in columns that line up down the list.

								The fold arrow, the picture, the name and the two buttons each
								keep their place whether or not this row has one — a notebook
								with children indented its own title by an arrow's width and a
								notebook with a picture pushed its buttons along, so no two
								rows in the column agreed about where anything was. The depth
								is the only thing allowed to move a row, and it moves the whole
								row rather than its parts.
							-->
							<div
								class="notebook-row {node.id === data.selected ? 'bg-gray-100' : ''}"
								style="padding-left: calc(1rem + {node.depth} * 1.6rem)"
							>
								{#if node.children.length > 0}
									<button
										class="icon-btn -ml-1 shrink-0"
										aria-label={t('notebooks.whatIsInside', {
											show: opened.has(node.id) ? t('ui.hide') : t('ui.show'),
											title: node.title
										})}
										aria-expanded={opened.has(node.id)}
										onclick={() => toggle(node.id)}
									>
										<Icon name={opened.has(node.id) ? 'chevron-down' : 'chevron-right'} size={14} />
									</button>
								{:else}
									<span class="icon-btn -ml-1 shrink-0" aria-hidden="true"></span>
								{/if}

								<!--
									The notebook's own picture, where a person's face would be.

									Reserved on every row: a shelf where some rows have one and
									some do not is a shelf whose names start in two places.
								-->
								{#if node.pictureId}
									<img
										src="/media/{node.pictureId}"
										alt=""
										loading="lazy"
										class="size-8 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
									/>
								{:else}
									<span
										aria-hidden="true"
										class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-100 text-gray-400"
									>
										<Icon name="notebook" size={14} />
									</span>
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
									size="size-10"
								/>
							{/if}
						{/snippet}
						{#snippet actions()}
							{#if selected}
								<!-- The way to the notebook's own page, from the column that is
								     showing it. The list on the left chooses what appears here. -->
								<a
									href={resolve('/notebooks/[id]', { id: String(selected.id) })}
									class="btn btn-sm"
								>
									{t('ui.open')}
									<Icon name="arrow-right" />
								</a>
								<!--
									Writing, where deleting the whole notebook used to be.

									This is a page for browsing notebooks, and the thing most
									often wanted from one on screen is another note in it —
									not destroying it, one press away, beside a list you are
									moving through. Deleting a notebook is on the notebook's
									own page, which is a place you go to on purpose.

									What it says follows the tab below it: it read "New note"
									while the Tasks tab was showing, which is a button offering
									the wrong thing about the list under it.
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
							areas={data.areas}
							workoutMeasures={data.workoutMeasures}
							slots={data.slots}
							todos={data.todos}
							allTodos={data.allTodos}
							activities={data.activities}
							bind:composing
							bind:newAction
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
			description={editing?.description ?? ''}
			defaultTags={editing?.defaultTags ?? ''}
		/>
	</form>

	<!-- Beside the form rather than in it: a picture goes up as multipart the
	     moment it is chosen, which is not the same submission as the words. A
	     notebook that does not exist yet has nothing to attach one to. -->
	{#if editing && editing.mine !== false}
		<div class="mt-3 flex items-start gap-3 border-t border-gray-200 pt-3">
			<NotebookPicture notebook={editing} kilobytes={data.pictureKilobytes} size="size-10" />
			<p class="text-sm text-gray-500">{t('notebooks.id.thePicture')}</p>
		</div>
	{/if}

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
