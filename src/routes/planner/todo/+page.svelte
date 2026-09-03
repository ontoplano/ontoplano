<script lang="ts">
	import { enhance } from '$app/forms';
	import Backlinks from '$lib/components/Backlinks.svelte';
	import TodoFields from '$lib/components/fields/TodoFields.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types.js';
	import { getAction, keyFor } from '$lib/shortcuts';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { CLOSED_STATUSES } from '$lib/task-status.js';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { invalidateAll } from '$app/navigation';
	import { cancelFor, changeLater, isPending } from '$lib/undo.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let showCompleted = $state(false);
	let selectedIndex = $state(0);
	let delegatingId: number | null = $state(null);
	let confirmingDelete: number | null = $state(null);
	let formRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		energy: null
	});

	/** How many of the folded-away ratings currently carry a value. */

	type Todo = (typeof data.todos)[number];

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

	let visibleTodos = $derived(
		showCompleted
			? data.todos
			: data.todos.filter((t: Todo) => !CLOSED_STATUSES.includes(shownStatus(t)))
	);

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
			changeLater(key, `Completed ${todo.title}`, () => {
				void fetch(action, {
					method: 'POST',
					body: formData,
					headers: { 'x-sveltekit-action': 'true' }
				}).then(() => invalidateAll());
			});
		};

	/** Today, as the value the scheduling form wants. */
	function todayStr(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

		const action = getAction('/planner/todo', e.key);
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
					const todo = visibleTodos[selectedIndex];
					{
						confirmingDelete = todo.id;
					}
				}
				break;
		}
	}

	function editingTodo(): Todo | null {
		return editingId ? (data.todos.find((t: Todo) => t.id === editingId) ?? null) : null;
	}

	$effect(() => {
		if (selectedIndex >= visibleTodos.length && visibleTodos.length > 0) {
			selectedIndex = visibleTodos.length - 1;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<button onclick={() => (showCompleted = !showCompleted)} class="btn btn-sm">
				{showCompleted ? 'Hide completed' : 'Show completed'}
			</button>
		</div>
		<button onclick={startNew} class="btn btn-primary btn-sm" data-tour="todo-new">
			<Icon name="plus" /> New todo
			<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs"
				>{keyFor('/planner/todo', 'new')}</kbd
			>
		</button>
	</div>

	<FormError message={form?.message} />

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? 'Edit todo' : 'New todo'}
		onclose={() => (editingId = null)}
	>
		{@const editing = editingTodo()}
		<form
			id="todo-form"
			method="post"
			action={editingId ? '?/update' : '?/create'}
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
					notebookId={editing?.notebookId ?? null}
					categories={data.categories}
					notebooks={data.notebooks}
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
		error={form?.message}
		onclose={() => (delegatingId = null)}
		title="Put it on a day"
		description="It keeps its place in the list and gains a time on the plan."
		size="sm"
	>
		{@const todo = data.todos.find((t: Todo) => t.id === delegatingId)}
		{#if todo}
			<form
				id="delegate-form"
				method="post"
				action="?/delegate"
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
						<input
							autocomplete="off"
							name="durationMinutes"
							type="number"
							min="15"
							step="15"
							value="60"
							class="input tabular"
						/>
					</Field>
					<Field label="Category" span={12} required>
						<select name="categoryId" required class="select">
							{#each data.categories as cat (cat.id)}
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
					: 'A todo is a task with no day on it. Put one here and drag it onto the board when it has a home.'}
			/>
		</div>
	{:else}
		<div
			class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card"
			data-tour="todo-list"
		>
			{#each visibleTodos as todo, i (todo.id)}
				<div
					use:keepInView={selectedIndex === i}
					class="flex items-start gap-4 px-4 py-3 {selectedIndex === i
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {isDone(todo) ? 'opacity-50' : ''}"
				>
					<form
						id="toggle-form-{todo.id}"
						method="post"
						action="?/setStatus"
						use:enhance={deferComplete(todo)}
					>
						<input type="hidden" name="id" value={todo.id} />
						<input type="hidden" name="status" value={todo.status === 'done' ? 'todo' : 'done'} />
						<!--
							The box is 20px; the thing you tap is 44. A touch screen gives
							every button a 44px minimum height, which stretched a 20px-wide
							square into a tall rectangle — so the target is the button and
							the square is drawn inside it.
						-->
						<button
							type="submit"
							class="-m-1 flex shrink-0 items-center justify-center p-1 pointer-coarse:w-11"
							aria-label={isDone(todo) ? 'Mark incomplete' : 'Mark complete'}
						>
							<span
								class="flex h-5 w-5 items-center justify-center border {isDone(todo)
									? 'border-gray-400 bg-gray-400'
									: 'border-gray-400 bg-white'}"
							>
								{#if isDone(todo)}
									<svg class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
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

					<!-- Title and buttons side by side needs about 500px. Below `sm` the
					     buttons go under the title instead of over it. -->
					<div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
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
							</div>
							{#if todo.notes}
								<p class="truncate text-xs text-gray-500">{todo.notes}</p>
							{/if}
							<Backlinks
								goals={data.goalLinks.todos[todo.id]}
								notebook={todo.notebookId && todo.notebookTitle
									? { id: todo.notebookId, title: todo.notebookTitle }
									: null}
							/>
						</div>

						<div class="row-actions gap-1">
							{#if !isDone(todo)}
								<!-- One column changes; nothing is copied anywhere. -->
								<form method="post" action="?/schedule" use:enhance>
									<input type="hidden" name="id" value={todo.id} />
									<input
										type="hidden"
										name="scheduledDate"
										value={todo.scheduledDate ? '' : todayStr()}
									/>
									<button
										type="submit"
										class="btn btn-sm"
										aria-pressed={!!todo.scheduledDate}
										title={todo.scheduledDate ? 'Put back on the general list' : 'Pull onto today'}
									>
										{todo.scheduledDate ? 'On a day' : 'Today'}
									</button>
								</form>
							{/if}
							{#if !isDone(todo)}
								<button onclick={() => startDelegate(todo)} class="btn btn-sm btn-quiet">
									Delegate
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
							{#if confirmingDelete === todo.id}
								<form
									id="delete-form-{todo.id}"
									method="post"
									action="?/delete"
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
