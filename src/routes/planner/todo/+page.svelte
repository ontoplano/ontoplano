<script lang="ts">
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types.js';
	import { getAction } from '$lib/shortcuts';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import { RATINGS } from '$lib/ratings.js';
	import { CLOSED_STATUSES } from '$lib/task-status.js';

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
	const ratingsSet = $derived(Object.values(formRatings).filter((v) => v !== null).length);

	type Todo = (typeof data.todos)[number];

	let visibleTodos = $derived(
		showCompleted ? data.todos : data.todos.filter((t: Todo) => !CLOSED_STATUSES.includes(t.status))
	);

	function isDone(todo: Todo): boolean {
		return todo.status === 'done';
	}

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
		<button onclick={startNew} class="btn btn-primary btn-sm">
			<Icon name="plus" /> New todo
			<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs">n</kbd>
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
					await update();
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
				<Field label="Title" span={12} required>
					<input
						name="title"
						type="text"
						required
						autocomplete="off"
						value={editing?.title ?? ''}
						class="input"
					/>
				</Field>

				<Field label="Category" span={6}>
					<select name="categoryId" class="select">
						<option value="">— none —</option>
						{#each data.categories as cat (cat.id)}
							<option value={cat.id} selected={editing?.categoryId === cat.id}>{cat.name}</option>
						{/each}
					</select>
				</Field>

				<Field label="Notes" span={12}>
					<textarea name="notes" rows="3" class="textarea">{editing?.notes ?? ''}</textarea>
				</Field>

				<!-- Three optional five-point scales at the top of a create form read
				     as work to do before you may write anything down. -->
				<MoreOptions label="Urgency, interest, energy" count={ratingsSet}>
					{#each RATINGS as r (r)}
						<div class="col-span-12 sm:col-span-4">
							<RatingPicker rating={r} bind:value={formRatings[r]} />
						</div>
					{/each}
				</MoreOptions>
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
						await update();
						delegatingId = null;
					};
				}}
			>
				<input type="hidden" name="id" value={todo.id} />
				<input type="hidden" name="mode" value="category" />

				<p class="mb-3 text-sm font-medium text-gray-900">{todo.title}</p>

				<FormGrid>
					<Field label="Date" span={6} required>
						<input name="date" type="date" required value={formatDate(new Date())} class="input" />
					</Field>
					<Field label="Time" span={3} required>
						<input name="startTime" type="time" required value="09:00" class="input tabular" />
					</Field>
					<Field label="Minutes" span={3}>
						<input
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
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{showCompleted ? 'No todos yet.' : 'No pending todos.'}
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card">
			{#each visibleTodos as todo, i (todo.id)}
				<div
					class="flex items-center gap-4 px-4 py-3 {selectedIndex === i
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {isDone(todo) ? 'opacity-50' : ''}"
				>
					<form id="toggle-form-{todo.id}" method="post" action="?/setStatus" use:enhance>
						<input type="hidden" name="id" value={todo.id} />
						<input type="hidden" name="status" value={isDone(todo) ? 'todo' : 'done'} />
						<button
							type="submit"
							class="flex h-5 w-5 shrink-0 items-center justify-center border {isDone(todo)
								? 'border-gray-400 bg-gray-400'
								: 'border-gray-400 bg-white'}"
							aria-label={isDone(todo) ? 'Mark incomplete' : 'Mark complete'}
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
						</button>
					</form>

					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
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
					</div>

					<div class="flex shrink-0 items-center gap-2">
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
									class="border px-2 py-1 text-xs transition {todo.scheduledDate
										? 'border-gray-900 bg-gray-900 text-white'
										: 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}"
									title={todo.scheduledDate ? 'Put back on the general list' : 'Pull onto today'}
								>
									{todo.scheduledDate ? 'On a day' : 'Today'}
								</button>
							</form>
						{/if}
						{#if !isDone(todo)}
							<button
								onclick={() => startDelegate(todo)}
								class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 transition hover:bg-blue-50"
							>
								Delegate
							</button>
						{/if}
						<button
							onclick={() => startEdit(todo)}
							class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
						>
							<Icon name="edit" /> Edit
						</button>
						{#if confirmingDelete === todo.id}
							<form
								id="delete-form-{todo.id}"
								method="post"
								action="?/delete"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										confirmingDelete = null;
									};
								}}
							>
								<input type="hidden" name="id" value={todo.id} />
								<button
									type="submit"
									class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
									use:armed
								>
									Confirm?
								</button>
							</form>
							<button
								type="button"
								onclick={() => {
									confirmingDelete = null;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								Cancel
							</button>
						{:else}
							<button
								type="button"
								onclick={() => {
									confirmingDelete = todo.id;
								}}
								class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
							>
								<Icon name="trash" /> Delete
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
