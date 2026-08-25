<script lang="ts">
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { RELATIONSHIPS, RELATIONSHIP_LABELS } from '$lib/people';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Person = PageServerData['people'][number];

	let showForm = $state(false);
	let editingId = $state<number | null>(null);
	let confirmDelete = $state<number | null>(null);
	let selectedIndex = $state(0);

	const editing = $derived(
		editingId ? (data.people.find((p) => p.id === editingId) ?? null) : null
	);
	const selectedPerson = $derived(data.people.find((p) => p.id === data.selected) ?? null);

	function openCreate() {
		editingId = null;
		showForm = true;
	}

	function openEdit(person: Person) {
		editingId = person.id;
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
			confirmDelete = null;
			return;
		}
		if (e.key === 'n') {
			e.preventDefault();
			openCreate();
		}
		if (e.key === 'j' || e.key === 'k') {
			e.preventDefault();
			const max = data.people.length - 1;
			if (max < 0) return;
			selectedIndex = Math.min(Math.max(selectedIndex + (e.key === 'j' ? 1 : -1), 0), max);
		}
	}

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-end gap-3">
		<button onclick={openCreate} class="btn btn-primary btn-sm">
			<Icon name="plus" /> New person
			<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs">n</kbd>
		</button>
	</div>

	<FormError message={form?.message} />

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
		<Card title="Everyone" accent={SECTION_COLORS.diary} flush>
			{#if data.people.length === 0}
				<EmptyState
					icon="user"
					title="Nobody yet"
					description="Add the people who turn up in what you write, and every mention of them collects here."
				>
					{#snippet action()}
						<button onclick={openCreate} class="btn btn-primary">
							<Icon name="plus" /> New person
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each data.people as person, i (person.id)}
						<div
							class="flex items-center gap-4 px-4 py-3 {selectedIndex === i
								? 'bg-gray-100 ring-2 ring-gray-900 ring-inset'
								: ''}"
						>
							<a
								href="/diary/people?person={person.id}"
								class="min-w-0 flex-1 text-sm text-gray-900 hover:underline"
							>
								{person.name}
								<span class="eyebrow ml-2 text-gray-400">
									{RELATIONSHIP_LABELS[person.relationship]}
								</span>
								{#if person.notes}
									<span class="block truncate text-xs text-gray-500">{person.notes}</span>
								{/if}
							</a>

							<span class="tabular shrink-0 text-xs text-gray-400">
								{person.mentions}
								{person.mentions === 1 ? 'mention' : 'mentions'}
							</span>

							<button onclick={() => openEdit(person)} class="btn btn-sm">
								<Icon name="edit" /> Edit
							</button>

							{#if confirmDelete === person.id}
								<form
									method="post"
									action="?/delete"
									use:enhance={() =>
										async ({ update }) => {
											confirmDelete = null;
											await update();
										}}
									class="flex items-center gap-1"
								>
									<input type="hidden" name="id" value={person.id} />
									<button type="button" onclick={() => (confirmDelete = null)} class="btn btn-sm"
										>Cancel</button
									>
									<button class="btn btn-danger btn-sm" use:armed>Yes, delete</button>
								</form>
							{:else}
								<button onclick={() => (confirmDelete = person.id)} class="btn btn-danger btn-sm">
									<Icon name="trash" /> Delete
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Card>

		<Card
			title={selectedPerson ? selectedPerson.name : 'Mentions'}
			description={selectedPerson
				? RELATIONSHIP_LABELS[selectedPerson.relationship]
				: 'Pick somebody to see everything you wrote about them.'}
			accent={SECTION_COLORS.diary}
			flush
		>
			{#if !selectedPerson}
				<EmptyState icon="diary" title="Nobody selected" />
			{:else if data.entries.length === 0}
				<EmptyState
					icon="diary"
					title="Nothing written about {selectedPerson.name} yet"
					description="Mention them in a diary entry and it will show up here."
				/>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each data.entries as entry (entry.id)}
						<article class="px-4 py-3">
							<p class="text-sm whitespace-pre-wrap text-gray-900">{entry.content}</p>
							<p class="tabular mt-1 text-xs text-gray-400">
								{when(entry.createdAt)}{#if entry.forDate}&nbsp;· for {entry.forDate}{/if}
							</p>
						</article>
					{/each}
				</div>
			{/if}
		</Card>
	</div>
</div>

<Modal
	bind:open={showForm}
	error={form?.message}
	onclose={() => (editingId = null)}
	title={editingId ? 'Edit person' : 'New person'}
	size="sm"
>
	<form
		id="person-form"
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

		<FormGrid>
			<Field label="Name" span={8} required>
				<input name="name" required autocomplete="off" value={editing?.name ?? ''} class="input" />
			</Field>

			<Field label="How you know them" span={4}>
				<select name="relationship" class="select">
					{#each RELATIONSHIPS as value (value)}
						<option {value} selected={(editing?.relationship ?? 'other') === value}>
							{RELATIONSHIP_LABELS[value]}
						</option>
					{/each}
				</select>
			</Field>

			<Field label="Notes" span={12}>
				<textarea name="notes" rows="3" class="textarea">{editing?.notes ?? ''}</textarea>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
		<button type="submit" form="person-form" class="btn btn-primary">
			{editingId ? 'Save' : 'Add person'}
		</button>
	{/snippet}
</Modal>
