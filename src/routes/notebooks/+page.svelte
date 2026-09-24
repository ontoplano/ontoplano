<script lang="ts">
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
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import NotebookTags from '$lib/components/NotebookTags.svelte';
	import NotebookFields from '$lib/components/fields/NotebookFields.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import NotebookCover from '$lib/components/NotebookCover.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
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

	/** Which folders are open. Closed is the resting state, as in the gallery. */
	const opened = new SvelteSet<number>();
	const toggle = (id: number) => {
		if (opened.has(id)) opened.delete(id);
		else opened.add(id);
	};

	const orphaned = $derived(data.orphaned);

	/**
	 * The shelf, with the closed ones at the end.
	 *
	 * A closed notebook is a finished subject: it is kept, and it is not what
	 * somebody is looking for. Sorted here rather than on the server because
	 * the order is about how the shelf reads, and the tree the server builds is
	 * about what is inside what — two different questions.
	 */
	const shelved = $derived(data.tree.filter((node) => !node.closedAt));

	/*
	 * The ones that are finished with, folded away.
	 *
	 * A closed notebook is history — a trip that happened, a renovation that
	 * ended — and it was sitting on the same shelf as the ones being written
	 * in, only greyer. They are behind a line now, closed to begin with,
	 * because the shelf is for what you are working on.
	 */
	const closed = $derived(data.tree.filter((node) => Boolean(node.closedAt)));
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
							Notebooks belong to each other.

							A name with an em dash in it is a place: `Renovation — Kitchen`
							sits inside `Renovation`, the same reading the gallery gives an
							album and the same tree inventory draws for a location. Nothing
							to keep in step and nothing new to learn — renaming one moves it.
						-->
						<!--
							A notebook is its cover.

							They were rows with a stamp of a picture at the front, which is a
							list of names with a decoration; a shelf of subjects is a shelf of
							things, and you pick one the way you pick a book — by looking at
							it. The picture is the object and the name hangs under it, glued
							on rather than beside it.
						-->
						{#snippet cover(node: (typeof data.tree)[number])}
							<NotebookCover
								notebook={node}
								href="{resolve('/notebooks')}?notebook={node.id}"
								chosen={node.id === data.selected}
							>
								{#snippet actions()}
									{#if node.children.length > 0}
										<button
											class="icon-btn"
											aria-label={t('notebooks.whatIsInside', {
												show: opened.has(node.id) ? t('ui.hide') : t('ui.show'),
												title: node.title
											})}
											aria-expanded={opened.has(node.id)}
											onclick={() => toggle(node.id)}
										>
											<Icon
												name={opened.has(node.id) ? 'chevron-down' : 'chevron-right'}
												size={14}
											/>
										</button>
									{/if}
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

							They were flat siblings on one shelf with the children nudged a
							little to the right, so opening a folder produced covers that
							belonged to it and looked like more of the shelf — the indent is
							a few pixels and the eye does not count pixels. A ground behind
							the pair says it instead: the folder and its contents sit on one
							tint, and a folder inside that one gets a tint of its own.
						-->
						{#snippet notebookRow(node: (typeof data.tree)[number])}
							{#if node.children.length > 0 && opened.has(node.id)}
								<div class="notebook-family">
									{@render cover(node)}
									{#each node.children as child (child.id)}
										{@render notebookRow(child)}
									{/each}
								</div>
							{:else}
								{@render cover(node)}
							{/if}
						{/snippet}

						<div data-tour="notebook-shelf" class="notebook-shelf">
							{#each shelved as node (node.id)}
								{@render notebookRow(node)}
							{/each}
						</div>

						{#if closed.length > 0}
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
									{t('notebooks.closedCount', { count: closed.length })}
								</span>
								<span class="shelf-fold-line" aria-hidden="true"></span>
							</button>

							{#if showClosed}
								<div class="notebook-shelf">
									{#each closed as node (node.id)}
										{@render notebookRow(node)}
									{/each}
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
						{#snippet actions()}
							{#if selected}
								<!--
									Two rows, and what goes in each.

									Filling the notebook is the top one — the two ways to put
									something in it, with the primary verb at the end where a
									hand comes from. Leaving it is the bottom one: the labels
									on what is in here, and the way through to its own page.
									They were one row of four, which reads as four things of
									equal weight and is exactly what it is not.
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

									<div class="flex flex-wrap items-center justify-end gap-2">
										<!-- This subject's own words, rather than the whole
										     account's: the Tags tab used to sit in the room strip,
										     answering a question nobody has while looking at one
										     notebook. -->
										<button onclick={() => (managingTags = true)} class="btn btn-sm">
											<Icon name="tag" />
											{t('tags.manageTags')}
										</button>
										<!-- The way to the notebook's own page, from the column
										     that is showing it. The list on the left chooses what
										     appears here. -->
										<a
											href={resolve('/notebooks/[id]', { id: String(selected.id) })}
											class="btn btn-sm"
										>
											{t('ui.open')}
											<Icon name="arrow-right" />
										</a>
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
