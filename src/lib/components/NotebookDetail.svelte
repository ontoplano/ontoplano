<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteSet } from 'svelte/reactivity';
	import OneLine from '$lib/components/OneLine.svelte';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import { BackCloses } from '$lib/back-closes';
	import { isPhone } from '$lib/breakpoints';
	import { autogrow } from '$lib/actions/autogrow';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import { HORIZON_LABELS, type Horizon } from '$lib/goals';
	import { CLOSED_STATUSES } from '$lib/task-status';
	import TodoRows from '$lib/components/TodoRows.svelte';
	import { NOTEBOOK_TODO_ACTIONS } from '$lib/todo-actions';
	import type { Todo } from '$lib/services/todos';
	import { renderMarkdown } from '$lib/markdown';

	/**
	 * One notebook: what is in it, and what can be done to it.
	 *
	 * The same thing on two screens — beside the list on the index, and alone on
	 * its own page — so it is a component rather than markup written twice. The
	 * forms post to actions the two routes share.
	 */
	type Entry = {
		id: number;
		seq: number | null;
		/** What it is called. Empty on anything written before notes had names. */
		title?: string;
		content: string;
		createdAt: string;
		/** When it was put away, or null. Hidden, not deleted. */
		archivedAt?: string | null;
		tags: { id: number; name: string }[];
		people: { id: number; name: string }[];
	};

	let {
		notebook = null,
		contents = null,
		orphaned = [],
		showingOrphans = false,
		allPeople = [],
		categories = [],
		pickableNotebooks = []
	}: {
		notebook?: { id: number; title: string; description: string } | null;
		contents?: {
			entries: Entry[];
			todos: Todo[];
			blocks: { id: number; label: string | null; date: string; startTime: string }[];
			goals: { id: number; title: string; horizon: Horizon; periodStart: string; status: string }[];
		} | null;
		orphaned?: Entry[];
		showingOrphans?: boolean;
		/** Everybody already known, so the field completes rather than duplicates. */
		allPeople?: { id: number; name: string }[];
		/** What the Tasks tab's editor offers, the same as the to-do room's. */
		categories?: { id: number; name: string }[];
		pickableNotebooks?: { id: number; title: string }[];
	} = $props();

	let editingNoteId = $state<number | null>(null);

	/**
	 * Whether the put-away notes are showing.
	 *
	 * Away by default, which is what putting away means. A notebook kept for a
	 * year holds notes that have stopped being interesting and are still not
	 * things to delete, and a list of forty where six are current is a list
	 * nobody reads.
	 */
	let showArchivedNotes = $state(false);

	/*
	 * Which notes are open. Closed is the resting state, and opening one does
	 * not close another: comparing two notes is the reason to have a notebook.
	 */
	const openNotes = new SvelteSet<number>();
	const toggleNote = (id: number) => {
		if (openNotes.has(id)) openNotes.delete(id);
		else openNotes.add(id);
	};

	/**
	 * What to call a note in a list.
	 *
	 * Its title when it has one. Before titles existed every note was its
	 * content, so the first line stands in — which is what somebody would have
	 * typed as a title anyway — trimmed of the markdown that would read as
	 * punctuation in a list.
	 */
	function noteName(entry: { title?: string; content: string }): string {
		if (entry.title) return entry.title;
		const first = entry.content
			.split('\n')
			.map((line) =>
				line
					.replace(/^#{1,6}\s*/, '')
					.replace(/^[-*+]\s+/, '')
					.trim()
			)
			.find(Boolean);
		return first ? first.slice(0, 120) : 'Untitled';
	}

	/**
	 * Maximized: the notebook takes the whole screen.
	 *
	 * Reading or writing anything longer than a note wants more than a column
	 * beside a list. The surface below is a `<dialog>` that lays out as if it
	 * were not there — until `showModal()` promotes it, same DOM and all, to
	 * the top layer. Nothing is re-rendered on the way in or out, which is
	 * what keeps a half-written note, the open tab and the scroll exactly
	 * where they were.
	 */
	let maximized = $state(false);

	/**
	 * Whether the note composer is open. Closed to begin with, on every screen.
	 *
	 * It used to stand open above the notes, which is a form taking the top of
	 * the page whether or not anybody is writing.
	 */
	let composing = $state(false);
	let surface = $state<HTMLDialogElement>();

	/**
	 * The type sizes on offer, smallest to biggest. Steps rather than a
	 * slider: each one is a size somebody chose, and the ends are the sizes
	 * past which the column stops reading well. The first step is the app's
	 * own `text-sm`. The choice is the device's, kept in `localStorage`.
	 */
	const TYPE_STEPS = ['0.875rem', '1rem', '1.125rem', '1.25rem', '1.5rem'] as const;
	const DEFAULT_TYPE_STEP = 1;
	const TYPE_STEP_KEY = 'notebook.typeStep';

	let typeStep = $state(readTypeStep());

	function readTypeStep(): number {
		if (typeof localStorage === 'undefined') return DEFAULT_TYPE_STEP;
		try {
			const raw = localStorage.getItem(TYPE_STEP_KEY);
			const step = raw === null ? NaN : Number(raw);
			return Number.isInteger(step) && step >= 0 && step < TYPE_STEPS.length
				? step
				: DEFAULT_TYPE_STEP;
		} catch {
			return DEFAULT_TYPE_STEP;
		}
	}

	function setTypeStep(step: number) {
		typeStep = step;
		try {
			localStorage.setItem(TYPE_STEP_KEY, String(step));
		} catch {
			// Blocked storage loses the preference, not the feature.
		}
	}

	/** On a phone the maximized notebook is a screen, so back closes it. */
	const back = new BackCloses(() => leaveMaximized());

	$effect(() => back.watch());

	function enterMaximized() {
		maximized = true;
		surface?.showModal();
		if (isPhone()) back.claim();
	}

	function leaveMaximized() {
		maximized = false;
		if (surface?.open) surface.close();
		back.release();
	}

	// The boxes a picture writes its markdown into. Only one note is ever being
	// edited at a time, so one reference is enough for the whole list.
	let addBox = $state<HTMLTextAreaElement>();
	let editBox = $state<HTMLTextAreaElement>();
	let confirmDeleteNote = $state<number | null>(null);

	/**
	 * Notes, tasks and goals as tabs rather than three stacked lists.
	 *
	 * A notebook with a dozen notes pushed its tasks below the fold, so the two
	 * halves of "everything about this" could not be seen together at all.
	 */
	type Tab = 'notes' | 'tasks' | 'goals';
	let tab = $state<Tab>('notes');

	/*
	 * Whichever notebook you move to opens on its notes, not on whichever tab
	 * the last one happened to be showing.
	 *
	 * Compared by which notebook it is, not by the object: the props arrive
	 * fresh from every load, so watching `notebook` itself sent you back to
	 * Notes each time something on the Tasks tab was ticked off or put away.
	 * Deliberately not reactive — it is a memory of the last render, and
	 * writing it must not be what schedules the next one.
	 */
	let subjectOnScreen: string | null = null;

	$effect(() => {
		const subject = showingOrphans ? 'orphans' : String(notebook?.id ?? '');
		if (subject === subjectOnScreen) return;
		subjectOnScreen = subject;
		tab = 'notes';
	});

	/**
	 * How far along, where that means something.
	 *
	 * A tab that says "9" says how much there is and nothing about whether any
	 * of it is finished, which for a list of tasks is the more interesting half
	 * — a subject with nine tasks and two done is in a different state from one
	 * with nine and none. Notes have no such thing to say, so they keep a plain
	 * count rather than gaining a denominator that means nothing.
	 */
	/** The notes on screen: everything, or everything still out. */
	const shownNotes = $derived.by(() => {
		const all = contents?.entries ?? orphaned;
		return showArchivedNotes ? all : all.filter((entry) => !entry.archivedAt);
	});

	/** How many are put away, so the button can say what it would bring back. */
	const putAwayNotes = $derived(
		(contents?.entries ?? orphaned).filter((entry) => entry.archivedAt).length
	);

	const tabs = $derived<{ key: Tab; label: string; count: number; done?: number }[]>([
		{ key: 'notes', label: 'Notes', count: shownNotes.length },
		{
			key: 'tasks',
			label: 'Tasks',
			count: (contents?.todos.length ?? 0) + (contents?.blocks.length ?? 0),
			// A block on the grid is a thing that happens rather than a thing to
			// finish, so only the todos are counted as done or not.
			done: contents?.todos.filter((todo) => CLOSED_STATUSES.includes(todo.status)).length ?? 0
		},
		{
			key: 'goals',
			label: 'Goals',
			count: contents?.goals.length ?? 0,
			done: contents?.goals.filter((goal) => goal.status !== 'open').length ?? 0
		}
	]);

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<!--
	The dialog is the notebook's own surface, inline until `showModal()` — see
	the note on `maximized` above. `display: contents` below is what lets it
	stand here without being a box of its own.
-->
<dialog
	bind:this={surface}
	onclose={leaveMaximized}
	aria-label={notebook?.title ?? 'Notes'}
	class="nb-surface bg-white"
	style="--nb-type: {TYPE_STEPS[typeStep]}"
>
	{#if maximized}
		<header class="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2">
			<button
				type="button"
				onclick={leaveMaximized}
				aria-label="Back"
				class="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center text-gray-700 sm:hidden"
			>
				<svg
					class="h-6 w-6"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="square"
					aria-hidden="true"
				>
					<path d="M15 5l-7 7 7 7" />
				</svg>
			</button>
			<h2 class="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">
				{notebook?.title ?? 'Notes without a notebook'}
			</h2>
			<!--
				The type control: the same letter at the two sizes it moves between.
				Both ends stay drawn and disable rather than disappear, so the
				buttons never trade places under a finger.
			-->
			<button
				type="button"
				onclick={() => setTypeStep(typeStep - 1)}
				disabled={typeStep === 0}
				class="icon-btn"
				title="Smaller type"
				aria-label="Smaller type"
			>
				<span class="text-xs font-semibold">A</span>
			</button>
			<button
				type="button"
				onclick={() => setTypeStep(typeStep + 1)}
				disabled={typeStep === TYPE_STEPS.length - 1}
				class="icon-btn"
				title="Bigger type"
				aria-label="Bigger type"
			>
				<span class="text-lg font-semibold">A</span>
			</button>
			<button
				type="button"
				onclick={leaveMaximized}
				aria-label="Close"
				class="btn btn-quiet btn-sm hidden sm:flex"
			>
				&times;
			</button>
		</header>
	{/if}

	<div class="nb-body">
		{#if showingOrphans}
			{@render noteList(shownNotes, null)}
		{:else if !notebook || !contents}
			<EmptyState icon="notebook" title="Nothing chosen" />
		{:else}
			<!-- Everything about this notebook, one kind at a time. -->
			<div class="flex items-center border-b border-gray-200 pr-2">
				<div class="snap-strip min-w-0 flex-1 gap-1 px-2 md:flex">
					{#each tabs as t (t.key)}
						<button
							onclick={() => (tab = t.key)}
							class="tab-link px-3 py-2 text-sm font-medium whitespace-nowrap transition {tab ===
							t.key
								? 'border-b-2 text-gray-900'
								: 'text-gray-500 hover:text-gray-700'}"
							style={tab === t.key ? `border-color: ${SECTION_COLORS.diary}` : ''}
						>
							{t.label}
							<span class="tabular ml-1 text-xs text-gray-500">
								{t.done !== undefined && t.count > 0 ? `${t.done}/${t.count}` : t.count}
							</span>
						</button>
					{/each}
				</div>
				{#if tab === 'notes'}
					<!-- Nothing is hidden without the strip saying how much. -->
					{#if putAwayNotes > 0 || showArchivedNotes}
						<button
							type="button"
							onclick={() => (showArchivedNotes = !showArchivedNotes)}
							class="btn btn-sm mr-2 shrink-0"
						>
							{showArchivedNotes ? 'Hide archived' : `Show archived (${putAwayNotes})`}
						</button>
					{/if}
					<button
						type="button"
						onclick={() => (composing = !composing)}
						class="btn btn-sm mr-2 shrink-0"
					>
						{composing ? 'Cancel' : 'New note'}
					</button>
				{/if}
				<button
					type="button"
					onclick={() => (maximized ? leaveMaximized() : enterMaximized())}
					class="icon-btn shrink-0"
					title={maximized ? 'Back to the page' : 'The whole screen'}
					aria-label={maximized ? 'Back to the page' : 'Maximize'}
				>
					<Icon name="maximize" />
				</button>
			</div>

			{#if tab === 'notes'}
				<!--
			Writing about the kitchen renovation used to mean going to the Diary and
			remembering to pick the notebook from a dropdown.

			Behind a button, on every screen. Standing open it took the top of the
			notebook whether or not anybody was writing — a title box, a text box,
			a picture button and a fold of tags, above the notes somebody came to
			read. The button is where the form was, so opening it costs one press
			and closing it gives the space back.

			It is tinted and it ends in a rule: the notes below are separated from
			each other by exactly that line, so a composer with no edge of its own
			read as the first note in the list. A different surface says "this is
			where you write" without another heading to say it.
		-->
				{#if composing}
					<form
						method="post"
						action="?/addEntry"
						use:enhance={() =>
							async ({ update, result }) => {
								await update({ reset: result.type === 'success' });
								// Written and gone: the space belongs to the notes again.
								if (result.type === 'success') composing = false;
							}}
						class="border-b border-gray-200 bg-gray-50 px-4 pt-3 pb-4"
					>
						<input type="hidden" name="notebookId" value={notebook.id} />
						<!--
						A name first, because the list is names.

						Not required: a note jotted in a hurry should not be held up by a
						form asking what to call it, and one without a name is listed by
						its first line.
					-->
						<OneLine name="heading" placeholder="Title" class="input mb-2 w-full font-medium" />
						<textarea
							bind:this={addBox}
							name="content"
							rows="2"
							required
							use:autogrow
							placeholder="Write a note about {notebook.title}"
							class="textarea"
						></textarea>
						<!-- A note written here takes a picture the same way a note written in
			     the diary does. It was missing here, which made pictures look like
			     a feature of one screen rather than of notes. -->
						<PictureAttach target={addBox} />
						<!--
				Tags and people, the same as a note written in the diary.

				Folded away because the common act here is typing a line and
				pressing add, and two more boxes in front of that is a form where
				there was a composer. Open, they are the same two fields, posting
				the same two names.

				Indented to `btn-sm`'s own left padding so its marker starts where
				the picture button's icon starts: two controls stacked under a text
				box, reading as one column rather than as two half-aligned rows.
			-->
						<div class="mt-1 pl-2.5">
							<MoreOptions label="Tags, people" count={0} divided={false}>
								{@render tagsAndPeople('', '')}
							</MoreOptions>
						</div>
						<div class="mt-2 flex justify-end">
							<button class="btn btn-primary btn-sm"><Icon name="plus" /> Add note</button>
						</div>
					</form>
				{/if}

				{@render noteList(shownNotes, notebook.id)}
			{:else if tab === 'tasks'}
				<!--
					The to-do room, looking at one subject.

					A notebook's tasks used to be a read-only list: you could see that
					four things about the kitchen were waiting and could not tick one
					off without going somewhere else. It is the same component the
					room uses, so a todo behaves the same way wherever it is found —
					and a new one written here lands in this notebook.
				-->
				<div class="px-4 py-3">
					<TodoRows
						todos={contents.todos}
						{categories}
						notebooks={pickableNotebooks}
						actions={NOTEBOOK_TODO_ACTIONS}
						notebookId={notebook.id}
					/>
				</div>

				<!--
					Blocks below, and still a list: a block is a thing that happens at
					a time rather than a thing to finish, and it is edited on the day
					it sits on.
				-->
				{#if contents.blocks.length > 0}
					<ul class="divide-y divide-gray-200 border-t border-gray-200">
						{#each contents.blocks as block (`b${block.id}`)}
							<li class="flex items-center gap-3 px-4 py-2 text-sm">
								<Icon name="calendar" class="shrink-0 text-gray-500" />
								<span class="min-w-0 flex-1 truncate text-gray-900">{block.label}</span>
								<span class="tabular shrink-0 text-xs text-gray-500">
									{block.date}
									{block.startTime}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if contents.goals.length === 0}
				<p class="px-4 py-3 text-sm text-gray-500">
					No goal points at this notebook. It does not need one.
				</p>
			{:else}
				<ul class="divide-y divide-gray-200">
					{#each contents.goals as goal (goal.id)}
						<li class="flex items-center gap-3 px-4 py-2 text-sm">
							<Icon name="goals" class="shrink-0 text-gray-500" />
							<a
								href={resolve('/goals')}
								class="min-w-0 flex-1 truncate text-gray-900 hover:underline"
							>
								{goal.title}
							</a>
							<span class="tabular shrink-0 text-xs text-gray-500">
								{HORIZON_LABELS[goal.horizon]} · {goal.periodStart}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</dialog>

<!--
	One note, and the two things you can do to it.
	
	`notebookId` is null for a note whose notebook was deleted: editing one must
	not quietly adopt it into whatever notebook is on screen.
-->
<!--
	What a note carries besides its words, written the way the diary writes it:
	names typed inline, not a picker opened.
-->
{#snippet tagsAndPeople(tags: string, people: string)}
	<Field label="Tags" span={6} hint="Separate with commas or spaces. A leading # is fine.">
		<OneLine name="tags" placeholder="work, health" value={tags} class="input" />
	</Field>
	<Field label="People" span={6} hint="Anyone this note is about.">
		<input
			name="people"
			type="text"
			autocomplete="off"
			list="notebook-known-people"
			value={people}
			placeholder="Ana, João"
			class="input"
		/>
		<datalist id="notebook-known-people">
			{#each allPeople as person (person.id)}
				<option value={person.name}></option>
			{/each}
		</datalist>
	</Field>
{/snippet}

{#snippet noteList(entries: Entry[], notebookId: number | null)}
	{#if entries.length === 0}
		<p class="px-4 py-3 text-sm text-gray-500">Nothing written here yet.</p>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each entries as entry (entry.id)}
				<article class="px-4 py-3">
					{#if editingNoteId === entry.id}
						<form
							method="post"
							action="?/updateEntry"
							use:enhance={() =>
								async ({ update, result }) => {
									// The editor closes on success and is destroyed with its
									// fields; resetting only blanks them for a frame first, and
									// on a failure it would throw away what was written.
									await update({ reset: false });
									if (result.type === 'success') editingNoteId = null;
								}}
						>
							<input type="hidden" name="id" value={entry.id} />
							{#if notebookId !== null}
								<input type="hidden" name="notebookId" value={notebookId} />
							{/if}
							<OneLine
								name="heading"
								value={entry.title ?? ''}
								placeholder="Title"
								class="input mb-2 w-full font-medium"
							/>
							<textarea
								bind:this={editBox}
								name="content"
								rows="4"
								required
								use:autogrow
								class="textarea">{entry.content}</textarea
							>
							<PictureAttach target={editBox} />
							<div class="mt-3">
								<FormGrid>
									{@render tagsAndPeople(
										entry.tags.map((t) => t.name).join(', '),
										entry.people.map((p) => p.name).join(', ')
									)}
								</FormGrid>
							</div>
							<div class="mt-2 flex justify-end gap-2">
								<button type="button" class="btn btn-sm" onclick={() => (editingNoteId = null)}
									>Cancel</button
								>
								<button class="btn btn-primary btn-sm">Save</button>
							</div>
						</form>
					{:else}
						<!--
							A note is its name until you open it.

							A notebook is a subject somebody comes back to for months, and a
							column of full notes is a wall: what a list of them is for is
							finding the one you meant. Pressing the title opens it, and it
							stays open until pressed again.
						-->
						<button
							type="button"
							class="flex w-full items-baseline gap-2 text-left"
							aria-expanded={openNotes.has(entry.id)}
							onclick={() => toggleNote(entry.id)}
						>
							<span class="shrink-0 text-gray-400">
								<Icon name={openNotes.has(entry.id) ? 'chevron-down' : 'chevron-right'} size={14} />
							</span>
							<span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
								{noteName(entry)}
							</span>
						</button>
						{#if openNotes.has(entry.id)}
							<div class="md mt-2 text-sm text-gray-900">
								<!-- `renderMarkdown` escapes every character of the input before it emits a
								     tag, and emits only attributes it writes itself. See `$lib/markdown.ts`. -->
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html renderMarkdown(entry.content)}
							</div>
						{/if}
						<div class="mt-1 flex flex-wrap items-center gap-2">
							<span class="tabular text-xs text-gray-500">
								{entry.seq === null ? '' : `#${entry.seq} · `}{when(entry.createdAt)}
								{#if entry.archivedAt}
									· archived
								{/if}
								{#if 'author' in entry && entry.author}
									· {entry.author}
								{/if}
							</span>

							<!-- `@` for a person and `#` for a tag, the same one character
							     that makes the diary's rows legible. -->
							{#each entry.people as person (person.id)}
								<a href={resolve('/notebooks/people')} class="chip">@{person.name}</a>
							{/each}
							{#each entry.tags as tag (tag.id)}
								<span class="chip">#{tag.name}</span>
							{/each}

							<!-- In a shared notebook everybody reads everything, but a note
							     is edited and deleted only by whoever wrote it. -->
							<div
								class="ml-auto flex items-center gap-2"
								hidden={'mine' in entry && entry.mine === false}
							>
								<button
									onclick={() => (editingNoteId = entry.id)}
									class="icon-btn"
									title="Edit this note"
									aria-label="Edit this note"><Icon name="edit" /></button
								>
								<!--
									Away, and back. No confirmation: this is the reversible one
									— the note stays where it is and comes back unchanged. The
									button beside it is what deletes, and that one asks.
								-->
								<form method="post" action="?/archiveEntry" use:enhance>
									<input type="hidden" name="id" value={entry.id} />
									<input type="hidden" name="away" value={entry.archivedAt ? 'false' : 'true'} />
									<button
										type="submit"
										class="icon-btn"
										title={entry.archivedAt ? 'Take it back out' : 'Put it away'}
										aria-label={entry.archivedAt ? 'Take it back out' : 'Put it away'}
									>
										<Icon name={entry.archivedAt ? 'undo' : 'archive'} />
									</button>
								</form>
								{#if confirmDeleteNote === entry.id}
									<form
										method="post"
										action="?/deleteEntry"
										use:enhance={() =>
											async ({ update }) => {
												await update({ reset: false });
												confirmDeleteNote = null;
											}}
										class="flex items-center gap-2"
									>
										<input type="hidden" name="id" value={entry.id} />
										<button
											type="button"
											class="btn btn-sm"
											onclick={() => (confirmDeleteNote = null)}>Cancel</button
										>
										<button class="btn btn-danger btn-sm" use:armed>Yes, delete</button>
									</form>
								{:else}
									<button
										onclick={() => (confirmDeleteNote = entry.id)}
										class="icon-btn icon-btn-danger"
										title="Delete this note"
										aria-label="Delete this note"><Icon name="trash" /></button
									>
								{/if}
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
{/snippet}

<style>
	/*
	 * Inline, the surface is not there: `display: contents` lays its children
	 * out as if the card held them directly. Maximized, `showModal()` puts the
	 * same element in the top layer and these rules give it the screen. The
	 * DOM never moves between the two, which is the whole trick — see the
	 * comment on `maximized`.
	 */
	dialog.nb-surface {
		display: contents;
	}

	dialog.nb-surface[open] {
		display: flex;
		flex-direction: column;
		position: fixed;
		inset: 0;
		margin: 0;
		border: 0;
		padding: 0;
		padding-top: var(--safe-top, 0px);
		width: 100%;
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
	}

	/* Full screen already; a dimmer behind it would be dimming nothing. */
	dialog.nb-surface::backdrop {
		background: transparent;
	}

	/*
	 * The body scrolls on its own only when maximized — inline, the page is
	 * the scroller. Capped at a reading width: a note across a whole monitor
	 * is a line the eye loses its place tracking back from.
	 */
	dialog.nb-surface[open] .nb-body {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		width: 100%;
		max-width: var(--max-width-reading);
		margin-inline: auto;
	}

	/*
	 * The chosen type size, applied only maximized: the two-column page keeps
	 * the app's own scale. Headings ride along in em so the hierarchy scales
	 * as one thing; `:global` because the markdown's tags are not in this
	 * template.
	 */
	dialog.nb-surface[open] .md {
		font-size: var(--nb-type);
		line-height: 1.6;
	}

	dialog.nb-surface[open] .md :global(h1) {
		font-size: 1.3em;
	}

	dialog.nb-surface[open] .md :global(h2) {
		font-size: 1.15em;
	}

	dialog.nb-surface[open] .md :global(:is(h3, h4, h5, h6)) {
		font-size: 1em;
	}

	/* Writing at the size you read at. */
	dialog.nb-surface[open] textarea {
		font-size: var(--nb-type);
		line-height: 1.6;
	}
</style>
