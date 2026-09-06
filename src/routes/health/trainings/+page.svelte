<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const active = $derived(data.trainings.filter((t) => !t.archived));
	const archived = $derived(data.trainings.filter((t) => t.archived));

	// One form for new and edit, so the two cannot drift.
	let showForm = $state(false);
	let editing: (typeof data.trainings)[number] | null = $state(null);
	let showArchived = $state(false);
	let confirmingDelete: (typeof data.trainings)[number] | null = $state(null);

	const KINDS = [
		{ value: 'strength', label: 'Strength' },
		{ value: 'cardio', label: 'Cardio' },
		{ value: 'mobility', label: 'Mobility' },
		{ value: 'sport', label: 'Sport' },
		{ value: 'other', label: 'Other' }
	];
	function kindLabel(k: string): string {
		return KINDS.find((x) => x.value === k)?.label ?? k;
	}

	function openNew() {
		editing = null;
		showForm = true;
	}
	function openEdit(t: (typeof data.trainings)[number]) {
		editing = t;
		showForm = true;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<p class="text-sm text-gray-500">Workouts you can drop onto the week like a meal.</p>
		<button class="btn btn-primary btn-sm" onclick={openNew}>
			<Icon name="plus" /> New workout
		</button>
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
				<li class="flex flex-wrap items-center gap-3 px-4 py-3">
					<div class="min-w-0 flex-1">
						<span class="font-medium text-gray-900">{t.title}</span>
						<div class="text-xs text-gray-500">
							{kindLabel(t.kind)}{#if t.minutes}, ~{t.minutes} min{/if}{#if t.lastDoneAt}
								· last done {t.lastDoneAt.slice(0, 10)}{/if}
						</div>
					</div>

					<form method="post" action="?/done" use:enhance>
						<input type="hidden" name="id" value={t.id} />
						<button class="btn btn-sm" title="Record a session just now">Done</button>
					</form>

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
							<Icon name="skip" />
						</button>
					</form>
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
							<span class="text-xs text-gray-400">{kindLabel(t.kind)}</span>
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
		id="training-form"
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
					<input
						name="heading"
						required
						use:autofocus
						value={editing?.title ?? ''}
						class="input mt-1 w-full"
						placeholder="Push day"
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">Kind</span>
					<select name="kind" class="input mt-1 w-full" value={editing?.kind ?? 'other'}>
						{#each KINDS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
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
		<button class="btn btn-primary" type="submit" form="training-form">
			{editing ? 'Save' : 'Add'}
		</button>
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
