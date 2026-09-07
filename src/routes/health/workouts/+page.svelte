<script lang="ts">
	import { enhance } from '$app/forms';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const active = $derived(data.workouts.filter((t) => !t.archived));
	const archived = $derived(data.workouts.filter((t) => t.archived));

	// One form for new and edit, so the two cannot drift.
	let showForm = $state(false);
	let editing: (typeof data.workouts)[number] | null = $state(null);
	let showArchived = $state(false);
	let confirmingDelete: (typeof data.workouts)[number] | null = $state(null);
	/**
	 * The workout whose plan is open.
	 *
	 * The plan is what somebody reads while doing it, and it used to be
	 * reachable only through Edit — a form is the wrong place to read from,
	 * and one stray keystroke there rewrites the thing you came to consult.
	 */
	let expanded: number | null = $state(null);
	/** The workout being put on a day. */
	let scheduling: (typeof data.workouts)[number] | null = $state(null);

	function todayStr(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	function openNew() {
		editing = null;
		showForm = true;
	}
	function openEdit(t: (typeof data.workouts)[number]) {
		editing = t;
		showForm = true;
	}

	let showCategories = $state(false);
	let addingCategory = $state(false);
	let editingCategory = $state<number | null>(null);
	let confirmDeleteCategory = $state<number | null>(null);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<p class="text-sm text-gray-500">Workouts you can drop onto the week like a meal.</p>
		<div class="flex items-center gap-2">
			<button class="btn btn-sm btn-quiet" onclick={() => (showCategories = true)}
				>Categories</button
			>
			<button class="btn btn-primary btn-sm" onclick={openNew}>
				<Icon name="plus" /> New workout
			</button>
		</div>
	</div>

	{#if active.length === 0}
		<EmptyState
			icon="health"
			title="No workouts yet"
			description="Write a workout down — a plan and how long it takes — and it is ready to put on a day."
		/>
	{:else}
		<ul class="divide-y divide-gray-100 rounded border border-gray-200">
			{#each active as t (t.id)}
				<li class="list-row">
					<button
						class="list-row-main text-left"
						aria-label="Show the plan for {t.title}"
						aria-expanded={expanded === t.id}
						onclick={() => (expanded = expanded === t.id ? null : t.id)}
					>
						<span class="font-medium text-gray-900">
							<Icon name={expanded === t.id ? 'chevron-down' : 'chevron-right'} />
							{t.title}
						</span>
						<span class="block text-xs text-gray-500">
							{t.categoryName ?? 'No category'}{#if t.minutes}, ~{t.minutes} min{/if}{#if t.lastDoneAt}
								&nbsp;· last done {t.lastDoneAt.slice(0, 10)}{/if}
						</span>
					</button>

					<div class="list-row-actions">
						<form method="post" action="?/done" use:enhance>
							<input type="hidden" name="id" value={t.id} />
							<button class="icon-btn" title="Done just now" aria-label="Mark {t.title} done">
								<Icon name="check" />
							</button>
						</form>

						<button
							class="icon-btn"
							title="Put it on a day"
							aria-label="Plan {t.title} onto a day"
							onclick={() => (scheduling = t)}
						>
							<Icon name="calendar" />
						</button>

						<button class="icon-btn" aria-label="Edit {t.title}" onclick={() => openEdit(t)}>
							<Icon name="edit" />
						</button>

						<form
							method="post"
							action="?/archive"
							use:enhance
							title="Put this workout away — its history stays"
						>
							<input type="hidden" name="id" value={t.id} />
							<input type="hidden" name="archived" value="true" />
							<button class="icon-btn" aria-label="Archive {t.title}">
								<Icon name="archive" />
							</button>
						</form>
					</div>

					{#if expanded === t.id}
						<div
							class="w-full border-t border-gray-100 pt-3 text-sm whitespace-pre-wrap text-gray-700"
						>
							{#if t.plan}{t.plan}{:else}<span class="text-gray-400"
									>No plan written yet — Edit adds one.</span
								>{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if archived.length > 0}
		<div>
			<button
				class="text-sm text-gray-500 hover:text-gray-700"
				onclick={() => (showArchived = !showArchived)}
			>
				<Icon name={showArchived ? 'chevron-down' : 'chevron-right'} /> Archived ({archived.length})
			</button>
			{#if showArchived}
				<ul class="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
					{#each archived as t (t.id)}
						<li class="flex items-center gap-3 px-4 py-2 text-sm">
							<span class="min-w-0 flex-1 text-gray-600">{t.title}</span>
							<span class="text-xs text-gray-400">{t.categoryName ?? 'No category'}</span>
							<form method="post" action="?/archive" use:enhance>
								<input type="hidden" name="id" value={t.id} />
								<input type="hidden" name="archived" value="false" />
								<button class="btn btn-sm" type="submit">Restore</button>
							</form>
							<button
								class="icon-btn"
								aria-label="Delete {t.title}"
								onclick={() => (confirmingDelete = t)}
							>
								<Icon name="trash" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<!-- New / edit, one form. -->
<Modal
	bind:open={showForm}
	error={form?.message}
	title={editing ? 'Edit workout' : 'New workout'}
	onclose={() => (editing = null)}
	size="md"
>
	<form
		id="workout-form"
		method="post"
		action={editing ? '?/update' : '?/create'}
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') showForm = false;
				return update({ reset: result.type === 'success' });
			}}
	>
		{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
		<div class="space-y-3">
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block text-sm">
					<span class="text-gray-600">Name</span>
					<OneLine
						name="heading"
						placeholder="Push day"
						value={editing?.title ?? ''}
						class="input mt-1 w-full"
						required
						autofocus
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">Category</span>
					<select name="categoryId" class="input mt-1 w-full" value={editing?.categoryId ?? ''}>
						<option value="">— no category —</option>
						{#each data.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
					</select>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">About how long (min)</span>
					<input
						name="minutes"
						type="number"
						min="1"
						value={editing?.minutes ?? ''}
						class="input mt-1 w-full"
						placeholder="45"
					/>
				</label>
			</div>
			<label class="block text-sm">
				<span class="text-gray-600">Plan</span>
				<textarea
					name="plan"
					rows="4"
					class="input mt-1 w-full"
					placeholder="Bench, rows, dips. 4×8.">{editing?.plan ?? ''}</textarea
				>
			</label>
		</div>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showForm = false)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="workout-form">
			{editing ? 'Save' : 'Add'}
		</button>
	{/snippet}
</Modal>

<!-- Put it on a day: the same gesture a to-do has, and the same result — a
     block on the grid that IS this workout, so finishing either finishes both. -->
<Modal
	open={scheduling !== null}
	error={form?.message}
	title="Put it on a day"
	description="It gains a time on the plan. Finishing it there finishes the workout."
	onclose={() => (scheduling = null)}
	size="sm"
>
	{#if scheduling}
		<form
			id="schedule-form"
			method="post"
			action="?/schedule"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') scheduling = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={scheduling.id} />
			<p class="mb-3 text-sm font-medium text-gray-900">{scheduling.title}</p>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block text-sm">
					<span class="text-gray-600">Date</span>
					<input
						name="date"
						type="date"
						required
						value={todayStr()}
						class="input mt-1 w-full"
						autocomplete="off"
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">Time</span>
					<input
						name="startTime"
						type="time"
						required
						value="09:00"
						class="input tabular mt-1 w-full"
						autocomplete="off"
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">Minutes</span>
					<input
						name="durationMinutes"
						type="number"
						min="5"
						value={scheduling.minutes ?? 60}
						class="input mt-1 w-full"
					/>
				</label>
			</div>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (scheduling = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="schedule-form">Put on the day</button>
	{/snippet}
</Modal>

<!-- Hard delete, only from the archived list, confirmed in its own dialog. -->
<Modal
	open={confirmingDelete !== null}
	title="Delete this workout?"
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.title}</strong> is deleted for good, and comes off any day it was planned
			on. To keep it, leave it archived instead.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}>Keep it</button>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingDelete = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete?.id} />
			<button class="btn btn-danger" type="submit" use:armed>Delete</button>
		</form>
	{/snippet}
</Modal>

<!--
	The categories this account keeps.

	They were five words in the schema — strength, cardio, mobility, sport,
	other — which is somebody else deciding what your training is made of, and
	the fifth being called "other" is the proof it did not fit. The same shape
	and the same word as the shopping list's categories, because it is the same
	idea and calling it something else would be two names for one thing.
-->
<Modal
	bind:open={showCategories}
	error={form?.message}
	title="Categories of workout"
	description="Yours to name. A workout keeps existing if you remove the category it was filed under."
	size="sm"
>
	<ul class="divide-y divide-gray-200 border border-gray-200">
		{#each data.categories as category (category.id)}
			<li class="flex items-center gap-2 px-3 py-2">
				{#if editingCategory === category.id}
					<form
						method="post"
						action="?/renameCategory"
						use:enhance={() =>
							async ({ update, result }) => {
								await update({ reset: false });
								if (result.type === 'success') editingCategory = null;
							}}
						class="flex flex-1 items-center gap-2"
					>
						<input type="hidden" name="id" value={category.id} />
						<OneLine name="name" value={category.name} required autofocus class="input flex-1" />
						<button class="btn btn-sm btn-primary" title="Save" aria-label="Save the name">
							<Icon name="check" />
						</button>
						<button type="button" class="btn btn-sm" onclick={() => (editingCategory = null)}>
							Cancel
						</button>
					</form>
				{:else}
					<span class="flex-1 text-sm text-gray-900">{category.name}</span>
					<button
						onclick={() => (editingCategory = category.id)}
						class="icon-btn"
						title="Rename"
						aria-label="Rename {category.name}"><Icon name="edit" /></button
					>
					{#if confirmDeleteCategory === category.id}
						<form
							method="post"
							action="?/deleteCategory"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
									confirmDeleteCategory = null;
								}}
							class="flex items-center gap-1"
						>
							<input type="hidden" name="id" value={category.id} />
							<button
								type="button"
								class="btn btn-sm"
								onclick={() => (confirmDeleteCategory = null)}
							>
								Cancel
							</button>
							<button class="btn btn-danger btn-sm" use:armed>Remove</button>
						</form>
					{:else}
						<button
							onclick={() => (confirmDeleteCategory = category.id)}
							class="icon-btn icon-btn-danger"
							title="Remove"
							aria-label="Remove {category.name}"><Icon name="trash" /></button
						>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

	{#if addingCategory}
		<form
			method="post"
			action="?/createCategory"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: result.type === 'success' });
					if (result.type === 'success') addingCategory = false;
				}}
			class="mt-3 flex items-center gap-2"
		>
			<OneLine name="label" placeholder="Swimming" required autofocus class="input flex-1" />
			<button class="btn btn-sm btn-primary" title="Add" aria-label="Add the category">
				<Icon name="plus" />
			</button>
			<button type="button" class="btn btn-sm" onclick={() => (addingCategory = false)}
				>Cancel</button
			>
		</form>
	{:else}
		<button onclick={() => (addingCategory = true)} class="btn btn-sm mt-3">
			<Icon name="plus" /> New category
		</button>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn btn-primary" onclick={() => (showCategories = false)}
			>Done</button
		>
	{/snippet}
</Modal>
