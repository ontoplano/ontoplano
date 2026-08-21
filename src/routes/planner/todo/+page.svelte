<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types.js';
	import { autofocus } from '$lib/actions/autofocus.js';
	import { getAction } from '$lib/shortcuts';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let showCompleted = $state(false);
	let selectedIndex = $state(0);
	let delegatingId: number | null = $state(null);
	let confirmingDelete: number | null = $state(null);

	type Todo = (typeof data.todos)[number];

	let visibleTodos = $derived(
		showCompleted ? data.todos : data.todos.filter((t: Todo) => !t.completed)
	);

	function startNew() {
		showForm = true;
		editingId = null;
	}

	function startEdit(todo: Todo) {
		editingId = todo.id;
		showForm = true;
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
					!visibleTodos[selectedIndex].completed
				) {
					startDelegate(visibleTodos[selectedIndex]);
				}
				break;
			case 'delete':
				if (visibleTodos.length > 0 && visibleTodos[selectedIndex]) {
					const todo = visibleTodos[selectedIndex];
					if (confirmingDelete === todo.id) {
						const f = document.getElementById(`delete-form-${todo.id}`);
						if (f instanceof HTMLFormElement) f.requestSubmit();
						confirmingDelete = null;
					} else {
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
			<button
				onclick={() => (showCompleted = !showCompleted)}
				class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
			>
				{showCompleted ? 'Hide completed' : 'Show completed'}
			</button>
		</div>
		<button
			onclick={() => {
				if (showForm) {
					showForm = false;
					editingId = null;
				} else {
					startNew();
				}
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Todo'}
		</button>
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if showForm}
		{@const editing = editingTodo()}
		<form
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showForm = false;
					editingId = null;
				};
			}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Title</span>
				<input
					use:autofocus
					name="title"
					type="text"
					required
					autocomplete="off"
					value={editing?.title ?? ''}
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Notes (optional)</span>
				<textarea
					name="notes"
					rows="2"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>{editing?.notes ?? ''}</textarea
				>
			</label>
			<div class="flex gap-2">
				<button
					type="submit"
					class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					{editingId ? 'Update' : 'Create'}
				</button>
				<button
					type="button"
					onclick={() => {
						showForm = false;
						editingId = null;
					}}
					class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	{#if delegatingId}
		{@const todo = data.todos.find((t: Todo) => t.id === delegatingId)}
		{#if todo}
			<form
				method="post"
				action="?/delegate"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						delegatingId = null;
					};
				}}
				class="space-y-3 border border-blue-200 bg-blue-50 p-4 shadow-sm"
			>
				<h3 class="text-sm font-medium text-gray-900">Delegate: {todo.title}</h3>
				<input type="hidden" name="id" value={todo.id} />
				<div class="flex gap-3">
					<label class="w-40">
						<span class="text-sm font-medium text-gray-700">Date</span>
						<input
							use:autofocus
							name="date"
							type="date"
							required
							value={formatDate(new Date())}
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
					<label class="w-28">
						<span class="text-sm font-medium text-gray-700">Time</span>
						<input
							name="startTime"
							type="time"
							required
							value="09:00"
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
					<label class="w-24">
						<span class="text-sm font-medium text-gray-700">Duration</span>
						<input
							name="durationMinutes"
							type="number"
							min="15"
							step="15"
							value="60"
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
				</div>
				<input type="hidden" name="mode" value="category" />
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">Category</span>
					<select
						name="categoryId"
						required
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						{#each data.categories as cat (cat.id)}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
				</label>
				<div class="flex gap-2">
					<button
						type="submit"
						class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
					>
						Delegate
					</button>
					<button
						type="button"
						onclick={() => (delegatingId = null)}
						class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		{/if}
	{/if}

	{#if visibleTodos.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{showCompleted ? 'No todos yet.' : 'No pending todos.'}
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
			{#each visibleTodos as todo, i (todo.id)}
				<div
					class="flex items-center gap-4 px-4 py-3 {selectedIndex === i
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {todo.completed ? 'opacity-50' : ''}"
				>
					<form id="toggle-form-{todo.id}" method="post" action="?/toggleComplete" use:enhance>
						<input type="hidden" name="id" value={todo.id} />
						<input type="hidden" name="completed" value={String(todo.completed)} />
						<button
							type="submit"
							class="flex h-5 w-5 shrink-0 items-center justify-center border {todo.completed
								? 'border-gray-400 bg-gray-400'
								: 'border-gray-400 bg-white'}"
							aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
						>
							{#if todo.completed}
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
						<span class="text-sm font-medium text-gray-900 {todo.completed ? 'line-through' : ''}"
							>{todo.title}</span
						>
						{#if todo.notes}
							<p class="truncate text-xs text-gray-500">{todo.notes}</p>
						{/if}
					</div>

					<div class="flex shrink-0 items-center gap-2">
						{#if !todo.completed}
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
							Edit
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
								Delete
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
