<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { enhance } from '$app/forms';
	import Backlinks from '$lib/components/Backlinks.svelte';
	import TodoFields from '$lib/components/fields/TodoFields.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { getAction, keyFor } from '$lib/shortcuts';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { CLOSED_STATUSES } from '$lib/task-status';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { invalidateAll } from '$app/navigation';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { GoalBacklink } from '$lib/services/backlinks';
	import type { Todo } from '$lib/services/todos';
	import type { TodoActionNames } from '$lib/todo-actions';

	/**
	 * A list of todos and everything you can do to one.
	 *
	 * The to-do room shows all of them; a notebook shows the ones filed under
	 * it. Operating on a todo has to mean the same thing in both places —
	 * ticking it off, putting it on a day, editing it, putting it away — so the
	 * rows, the toolbar and the two dialogs are this component rather than
	 * markup written twice. Where the forms post is a prop, because a notebook
	 * page's own `delete` and `update` already belong to the notebook; see
	 * `$lib/todo-actions`.
	 */
	let {
		todos,
		categories,
		notebooks,
		actions,
		goalLinks = {},
		error = undefined,
		/**
		 * The notebook this list belongs to, when it is one notebook's.
		 *
		 * A new todo lands in it without being asked, and the rows drop the
		 * notebook chip: everything here is filed under the notebook whose page
		 * this is, so naming it on every row says nothing.
		 */
		notebookId = null,
		/**
		 * The screen whose keyboard shortcuts drive this list, if any.
		 *
		 * A list beside other things on a page must not swallow the keyboard —
		 * pressing `e` in a notebook belongs to whatever the notebook decides,
		 * not to whichever todo a cursor happens to sit on.
		 */
		shortcutRoom = null,
		listTour = null,
		newTour = null
	}: {
		todos: Todo[];
		categories: { id: number; name: string }[];
		notebooks: { id: number; title: string }[];
		actions: TodoActionNames;
		goalLinks?: Record<number, GoalBacklink[]>;
		error?: string | undefined;
		notebookId?: number | null;
		shortcutRoom?: string | null;
		listTour?: string | null;
		newTour?: string | null;
	} = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let showCompleted = $state(false);
	/** Put-away tasks are out of the way by default; that is what putting away is. */
	let showArchived = $state(false);
	/**
	 * Which notebook's tasks to show.
	 *
	 * `''` is all of them, `'none'` the ones filed under nothing — which is a
	 * real answer and not the absence of one: a task nobody has placed is
	 * exactly what somebody goes looking for. Not offered inside a notebook,
	 * where the answer is already fixed.
	 */
	let notebookFilter = $state('');
	let selectedIndex = $state(0);
	let delegatingId: number | null = $state(null);
	let confirmingDelete: number | null = $state(null);
	let formRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		energy: null
	});

	/**
	 * What the row says right now.
	 *
	 * A tick is held for the undo window rather than sent, so between the click
	 * and the write there is nothing on the server to read: the list renders the
	 * outcome itself, and Undo just cancels the timer. Reopening is not held —
	 * it is already the undo of a tick.
	 */
	function shownStatus(todo: Todo): Todo['status'] {
		return isPending(undoKey(todo)) ? 'done' : todo.status;
	}

	function undoKey(todo: Todo): string {
		return `todo:${todo.id}`;
	}

	/*
	 * Newest first, and the other way if you ask.
	 *
	 * The service hands these back in the order they were put in, which is the
	 * order a hand-sorted list wants and the wrong one for a list you keep
	 * adding to: the thing just written was at the bottom, under everything
	 * already ignored. Newest first is what somebody is looking for; oldest
	 * first is the deliberate question — what has been on here longest.
	 *
	 * Kept in this browser: it is a way of looking at a list rather than a fact
	 * about the account, and flipping it on a phone says nothing about a laptop.
	 */
	let newestFirst = $state(true);
	$effect(() => {
		try {
			const held = localStorage.getItem('ontoplano:todos-newest');
			if (held !== null) newestFirst = held === '1';
		} catch {
			// A private window, or storage refused. The default stands.
		}
	});

	function flipOrder() {
		newestFirst = !newestFirst;
		try {
			localStorage.setItem('ontoplano:todos-newest', newestFirst ? '1' : '0');
		} catch {
			// It still flips for this visit; only the memory is lost.
		}
	}

	let visibleTodos = $derived.by(() => {
		let shown = showCompleted
			? todos
			: todos.filter((t: Todo) => !CLOSED_STATUSES.includes(shownStatus(t)));

		// Away unless asked for. An archived task is one somebody has decided
		// not to look at, so the list honours that until they say otherwise.
		if (!showArchived) shown = shown.filter((t: Todo) => t.archivedAt === null);

		if (notebookFilter === 'none') shown = shown.filter((t: Todo) => t.notebookId === null);
		else if (notebookFilter !== '')
			shown = shown.filter((t: Todo) => String(t.notebookId) === notebookFilter);

		return [...shown].sort((a: Todo, b: Todo) =>
			newestFirst ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)
		);
	});

	/** How many are hidden by the two toggles, so neither is a silent filter. */
	let putAway = $derived(todos.filter((t: Todo) => t.archivedAt !== null).length);

	function isDone(todo: Todo): boolean {
		return shownStatus(todo) === 'done';
	}

	/**
	 * Ticking one off, with a few seconds to have meant something else.
	 *
	 * Clicking the box a second time inside the window is the same gesture as
	 * pressing Undo in the toast, so it cancels rather than queueing the
	 * opposite write behind the first.
	 */
	const deferComplete =
		(todo: Todo): SubmitFunction =>
		({ action, formData, cancel }) => {
			const key = undoKey(todo);
			if (isPending(key)) {
				cancel();
				cancelFor(key);
				return;
			}
			if (todo.status === 'done') return;

			cancel();

			const write = (status: string) => {
				const body = new FormData();
				body.set('id', String(todo.id));
				body.set('status', status);
				return fetch(action, {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				}).then(() => invalidateAll());
			};

			// Written now, not when the toast expires: a todo that says done here
			// and is still open everywhere it is counted is one screen telling two
			// stories. Undo puts it back to todo.
			changeNow(
				key,
				`Completed ${todo.title}`,
				() => write(String(formData.get('status') ?? 'done')),
				() => write('todo')
			);
		};

	/** Today, as the value the scheduling form wants. */
	function todayStr(): string {
		return formatDate(new Date());
	}

	function startNew() {
		showForm = true;
		editingId = null;
		formRatings = { urgency: null, interest: null, energy: null };
	}

	function startEdit(todo: Todo) {
		editingId = todo.id;
		showForm = true;
		formRatings = { ...todo.ratings };
	}

	function startDelegate(todo: Todo) {
		delegatingId = todo.id;
	}

	function formatDate(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!shortcutRoom) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			showForm = false;
			editingId = null;
			delegatingId = null;
			confirmingDelete = null;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const action = getAction(shortcutRoom, e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				confirmingDelete = null;
				if (visibleTodos.length > 0) {
					selectedIndex = Math.min(selectedIndex + 1, visibleTodos.length - 1);
				}
				break;
			case 'navigate-up':
				confirmingDelete = null;
				if (visibleTodos.length > 0) {
					selectedIndex = Math.max(selectedIndex - 1, 0);
				}
				break;
			case 'new':
				startNew();
				break;
			case 'edit':
				if (visibleTodos.length > 0 && visibleTodos[selectedIndex]) {
					startEdit(visibleTodos[selectedIndex]);
				}
				break;
			case 'toggle-done':
				if (visibleTodos.length > 0 && visibleTodos[selectedIndex]) {
					const f = document.getElementById(`toggle-form-${visibleTodos[selectedIndex].id}`);
					if (f instanceof HTMLFormElement) f.requestSubmit();
				}
				break;
			case 'delegate':
				if (
					visibleTodos.length > 0 &&
					visibleTodos[selectedIndex] &&
					!isDone(visibleTodos[selectedIndex])
				) {
					startDelegate(visibleTodos[selectedIndex]);
				}
				break;
			case 'delete':
				if (visibleTodos.length > 0 && visibleTodos[selectedIndex]) {
					// Arms the confirmation only. Deleting takes a deliberate click.
					confirmingDelete = visibleTodos[selectedIndex].id;
				}
				break;
		}
	}

	function editingTodo(): Todo | null {
		return editingId ? (todos.find((t: Todo) => t.id === editingId) ?? null) : null;
	}

	$effect(() => {
		if (selectedIndex >= visibleTodos.length && visibleTodos.length > 0) {
			selectedIndex = visibleTodos.length - 1;
		}
	});

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: 'New to-do',
		run: startNew,
		tour: newTour ?? '',
		kbd: shortcutRoom ? keyFor(shortcutRoom, 'new') : ''
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<RoomToolbar>
		{#snippet tools()}
			<!--
				One row on a phone, not three.

				"Show completed", the notebook picker and the sort order each took
				a line of their own at 390px — a third of the screen spent before
				a single task. The labels say the short form where there is no
				room for the long one, and the picker gives up its width first.

				A toggle also says which way it is set rather than only what
				pressing it would do: `aria-pressed` is what the app's own `.btn`
				reads to draw a control as held.
			-->
			<button
				onclick={() => (showCompleted = !showCompleted)}
				aria-pressed={showCompleted}
				class="btn btn-sm shrink-0"
			>
				<span class="sm:hidden">Completed</span>
				<span class="hidden sm:inline">{showCompleted ? 'Hide completed' : 'Show completed'}</span>
			</button>
			<!-- Named with its number so a put-away task is never quietly gone:
			     nothing is hidden without the list saying how much. -->
			<button
				onclick={() => (showArchived = !showArchived)}
				aria-pressed={showArchived}
				class="btn btn-sm"
				hidden={putAway === 0 && !showArchived}
			>
				{showArchived ? 'Hide archived' : `Show archived (${putAway})`}
			</button>
			{#if notebookId === null}
				<!-- "Not in one" is an answer, not the absence of a filter: a task
				     nobody has placed is the thing people go looking for. -->
				<label class="min-w-0 flex-1 text-sm sm:flex-none">
					<span class="sr-only">Notebook</span>
					<select bind:value={notebookFilter} class="select w-full">
						<option value="">Every notebook</option>
						<option value="none">Not in one</option>
						{#each notebooks as book (book.id)}
							<option value={String(book.id)}>{book.title}</option>
						{/each}
					</select>
				</label>
			{/if}
			<button
				onclick={flipOrder}
				class="btn btn-sm shrink-0"
				title={newestFirst
					? 'Newest at the top — press for the oldest'
					: 'Oldest at the top — press for the newest'}
			>
				<Icon name={newestFirst ? 'chevron-down' : 'chevron-up'} />
				<span class="sm:hidden">{newestFirst ? 'Newest' : 'Oldest'}</span>
				<span class="hidden sm:inline">{newestFirst ? 'Newest first' : 'Oldest first'}</span>
			</button>
		{/snippet}
	</RoomToolbar>

	<Modal
		bind:open={showForm}
		{error}
		title={editingId ? 'Edit to-do' : 'New to-do'}
		onclose={() => (editingId = null)}
	>
		{@const editing = editingTodo()}
		<form
			id="todo-form"
			method="post"
			action={editingId ? actions.update : actions.create}
			use:enhance={() => {
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						showForm = false;
						editingId = null;
					}
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}

			<FormGrid>
				<TodoFields
					title={editing?.title ?? ''}
					notes={editing?.notes ?? ''}
					categoryId={editing?.categoryId ?? null}
					notebookId={editing?.notebookId ?? notebookId}
					{categories}
					{notebooks}
					bind:ratings={formRatings}
				/>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
			<button type="submit" form="todo-form" class="btn btn-primary">
				{editingId ? 'Save' : 'Create todo'}
			</button>
		{/snippet}
	</Modal>

	<Modal
		open={delegatingId !== null}
		{error}
		onclose={() => (delegatingId = null)}
		title="Put it on a day"
		description="It keeps its place in the list and gains a time on the plan."
		size="sm"
	>
		{@const todo = todos.find((t: Todo) => t.id === delegatingId)}
		{#if todo}
			<form
				id="delegate-form"
				method="post"
				action={actions.delegate}
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
						delegatingId = null;
					};
				}}
			>
				<input type="hidden" name="id" value={todo.id} />
				<input type="hidden" name="mode" value="category" />

				<p class="mb-3 text-sm font-medium text-gray-900">{todo.title}</p>

				<FormGrid>
					<Field label="Date" span={6} required>
						<input
							autocomplete="off"
							name="date"
							type="date"
							required
							value={formatDate(new Date())}
							class="input"
						/>
					</Field>
					<Field label="Time" span={3} required>
						<input
							autocomplete="off"
							name="startTime"
							type="time"
							required
							value="09:00"
							class="input tabular"
						/>
					</Field>
					<Field label="Minutes" span={3}>
						<NumberBox autocomplete="off" name="durationMinutes" min="15" step="15" value="60" />
					</Field>
					<Field label="Category" span={12} required>
						<select name="categoryId" required class="select">
							{#each categories as cat (cat.id)}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</Field>
				</FormGrid>
			</form>
		{/if}

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (delegatingId = null)}>Cancel</button>
			<button type="submit" form="delegate-form" class="btn btn-primary">Put on the day</button>
		{/snippet}
	</Modal>

	{#if visibleTodos.length === 0}
		<div class="border border-gray-200 bg-white shadow-sm">
			<EmptyState
				icon="check"
				title={showCompleted ? 'Nothing here yet' : 'Nothing waiting'}
				description={showCompleted
					? 'Anything you finish shows up here.'
					: 'A to-do is a task with no day on it. Put one here and drag it onto the board when it has a home.'}
			/>
		</div>
	{:else}
		<div
			class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card"
			data-tour={listTour}
		>
			{#each visibleTodos as todo, i (todo.id)}
				<div
					use:keepInView={shortcutRoom !== null && selectedIndex === i}
					class="flex items-stretch gap-4 px-4 py-3 {shortcutRoom && selectedIndex === i
						? 'kb-cursor'
						: ''} {isDone(todo) ? 'opacity-50' : ''}"
				>
					<form
						id="toggle-form-{todo.id}"
						method="post"
						action={actions.setStatus}
						use:enhance={deferComplete(todo)}
						class="flex"
					>
						<input type="hidden" name="id" value={todo.id} />
						<input type="hidden" name="status" value={todo.status === 'done' ? 'todo' : 'done'} />
						<!--
							As tall as the row it belongs to.

							The box was 20px pinned to the top-left of a row that is often
							three lines tall — notes, a notebook, a column of icons — so it
							sat in a corner of a lot of nothing and was a small thing to hit
							besides. The target now runs the height of the row and the
							square is bigger and centred in it, which fills the space the
							rest of the row makes and gives the one action every row has the
							size it deserves.
						-->
						<button
							type="submit"
							class="-m-1 flex shrink-0 items-center justify-center self-stretch p-1 pointer-coarse:w-11"
							aria-label={isDone(todo) ? 'Mark incomplete' : 'Mark complete'}
						>
							<span
								class="flex size-7 items-center justify-center border {isDone(todo)
									? 'border-gray-400 bg-gray-400'
									: 'border-gray-400 bg-white'}"
							>
								{#if isDone(todo)}
									<svg class="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
										<path
											fill-rule="evenodd"
											d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
											clip-rule="evenodd"
										/>
									</svg>
								{/if}
							</span>
						</button>
					</form>

					<!-- One row at every width: the actions are a narrow column of icons
					     now, which fits beside the title on a phone. -->
					<div class="flex min-w-0 flex-1 gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								{#if todo.categoryColor}
									<span
										class="h-3 w-1 shrink-0"
										style="background-color: {todo.categoryColor}"
										title={todo.categoryName}
									></span>
								{/if}
								<span class="text-sm font-medium text-gray-900 {isDone(todo) ? 'line-through' : ''}"
									>{todo.title}</span
								>
								<RatingBadges values={todo.ratings} />
								{#if todo.scheduledDate}
									<span
										class="tabular border border-gray-200 bg-gray-50 px-1 text-[10px] text-gray-600"
										title="Pulled onto this day"
									>
										{todo.scheduledDate}
									</span>
								{/if}
								{#if todo.archivedAt}
									<span
										class="border border-gray-200 bg-gray-50 px-1 text-[10px] text-gray-600"
										title="Put away"
									>
										Archived
									</span>
								{/if}
							</div>
							{#if todo.notes}
								<p class="truncate text-xs text-gray-500">{todo.notes}</p>
							{/if}
							<Backlinks
								goals={goalLinks[todo.id]}
								notebook={notebookId === null && todo.notebookId && todo.notebookTitle
									? { id: todo.notebookId, title: todo.notebookTitle }
									: null}
							/>
						</div>

						<!--
							Stacked up the right-hand edge, delete at the bottom: the same
							column an idea card has, so the two rooms behave alike.
						-->
						<div class="row-actions-stack">
							{#if !isDone(todo)}
								<!-- One column changes; nothing is copied anywhere. -->
								<form method="post" action={actions.schedule} use:enhance>
									<input type="hidden" name="id" value={todo.id} />
									<input
										type="hidden"
										name="scheduledDate"
										value={todo.scheduledDate ? '' : todayStr()}
									/>
									<button
										type="submit"
										class="icon-btn"
										aria-pressed={!!todo.scheduledDate}
										aria-label={todo.scheduledDate
											? 'Put back on the general list'
											: 'Pull onto today'}
										title={todo.scheduledDate ? 'Put back on the general list' : 'Pull onto today'}
									>
										<Icon name={todo.scheduledDate ? 'undo' : 'arrow-down'} />
									</button>
								</form>
							{/if}
							{#if !isDone(todo)}
								<button
									onclick={() => startDelegate(todo)}
									class="icon-btn"
									title="Delegate to a day"
									aria-label="Delegate to a day"
								>
									<Icon name="calendar" />
								</button>
							{/if}
							<button
								title="Edit"
								aria-label="Edit"
								onclick={() => startEdit(todo)}
								class="icon-btn"
							>
								<Icon name="edit" />
							</button>
							<!--
								Away, and back. Not a confirmation: putting a task away is
								the reversible one — the button beside it is what deletes,
								and that one asks.
							-->
							<!-- Plain `use:enhance`: the default applies the result and
							     re-reads the page, which is how the row leaves the list. -->
							<form method="post" action={actions.archive} use:enhance>
								<input type="hidden" name="id" value={todo.id} />
								<input type="hidden" name="away" value={todo.archivedAt ? 'false' : 'true'} />
								<button
									type="submit"
									class="icon-btn"
									title={todo.archivedAt ? 'Take it back out' : 'Put it away'}
									aria-label={todo.archivedAt ? 'Take it back out' : 'Put it away'}
								>
									<Icon name={todo.archivedAt ? 'undo' : 'archive'} />
								</button>
							</form>
							{#if confirmingDelete === todo.id}
								<form
									id="delete-form-{todo.id}"
									method="post"
									action={actions.remove}
									use:enhance={() => {
										return async ({ update }) => {
											await update({ reset: false });
											confirmingDelete = null;
										};
									}}
								>
									<input type="hidden" name="id" value={todo.id} />
									<button type="submit" class="btn btn-sm btn-danger" use:armed> Confirm? </button>
								</form>
								<button
									type="button"
									onclick={() => {
										confirmingDelete = null;
									}}
									class="btn btn-sm"
								>
									Cancel
								</button>
							{:else}
								<button
									title="Delete"
									aria-label="Delete"
									type="button"
									onclick={() => {
										confirmingDelete = todo.id;
									}}
									class="icon-btn icon-btn-danger"
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
