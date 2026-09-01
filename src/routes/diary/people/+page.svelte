<script lang="ts">
	import { resolve } from '$app/paths';
	import { getAction, keyFor } from '$lib/shortcuts';
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
	import { keepInView } from '$lib/actions/keep-in-view';

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
		const action = getAction('/diary/people', e.key);
		if (action === 'new') {
			e.preventDefault();
			openCreate();
		}
		if (action === 'navigate-down' || action === 'navigate-up') {
			e.preventDefault();
			const max = data.people.length - 1;
			if (max < 0) return;
			selectedIndex = Math.min(
				Math.max(selectedIndex + (action === 'navigate-down' ? 1 : -1), 0),
				max
			);
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
	<!-- Title and button on one line; the button had a row of its own. -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-lg font-bold text-gray-900">People</h1>
		<button onclick={openCreate} class="btn btn-primary btn-sm" data-tour="people-new">
			<Icon name="plus" /> New person
			<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs"
				>{keyFor('/diary/people', 'new')}</kbd
			>
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
				<div class="divide-y divide-gray-200" data-tour="people-list">
					{#each data.people as person, i (person.id)}
						<!-- Two buttons and a count beside a name is more than a phone has
						     room for; below `sm` they go under it. -->
						<div
							use:keepInView={selectedIndex === i}
							class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 {selectedIndex ===
							i
								? 'bg-gray-100 ring-2 ring-gray-900 ring-inset'
								: ''}"
						>
							<a
								href={resolve(`/diary/people?person=${person.id}`)}
								class="min-w-0 flex-1 text-sm text-gray-900 hover:underline"
							>
								{person.name}
								<span class="eyebrow ml-2 text-gray-500">
									{RELATIONSHIP_LABELS[person.relationship]}
								</span>
								{#if person.notes}
									<span class="block truncate text-xs text-gray-500">{person.notes}</span>
								{/if}
							</a>

							<div class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:gap-4">
								<span class="tabular text-xs text-gray-500">
									{person.mentions}
									{person.mentions === 1 ? 'mention' : 'mentions'}
								</span>

								<button
									title="Edit"
									aria-label="Edit"
									onclick={() => openEdit(person)}
									class="btn btn-sm"
								>
									<Icon name="edit" />
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
									<button
										title="Delete"
										aria-label="Delete"
										onclick={() => (confirmDelete = person.id)}
										class="btn btn-danger btn-sm"
									>
										<Icon name="trash" />
									</button>
								{/if}
							</div>
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
							<p class="tabular mt-1 text-xs text-gray-500">
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
			<!--
				Six and six rather than eight and four: "How you know them" wrapped
				onto a second line in the narrow column, which pushed its select a
				line below the name box beside it.
			-->
			<Field label="Name" span={6} required>
				<input name="label" required autocomplete="off" value={editing?.name ?? ''} class="input" />
			</Field>

			<Field label="How you know them" span={6}>
				<select name="relationship" class="select">
					{#each RELATIONSHIPS as value (value)}
						<option {value} selected={(editing?.relationship ?? 'other') === value}>
							{RELATIONSHIP_LABELS[value]}
						</option>
					{/each}
				</select>
			</Field>

			<!--
				A birthday you only half know is the ordinary case, so the year is
				optional: `--03-14` is the vCard spelling and what the field stores.
				A plain date input cannot express it, which is why this is text.

				`bornOn`, `theirPhone`, `theirEmail` rather than the obvious names:
				a browser classifies a field by its name before it reads
				autocomplete, so calling this one after the address field it
				resembles would offer YOUR details while you are typing somebody
				else's. tests/autofill-field-names.test.ts is the rule, and it
				reads the markup literally — including comments.
			-->
			<Field label="Birthday" span={4} hint="1990-03-14, or --03-14 without the year">
				<input
					name="bornOn"
					autocomplete="off"
					placeholder="1990-03-14"
					value={editing?.birthday ?? ''}
					class="input"
				/>
			</Field>

			<Field label="Phone" span={4}>
				<input
					name="theirPhone"
					type="tel"
					autocomplete="off"
					value={editing?.phone ?? ''}
					class="input"
				/>
			</Field>

			<Field label="Email" span={4}>
				<input
					name="theirEmail"
					type="email"
					autocomplete="off"
					value={editing?.email ?? ''}
					class="input"
				/>
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
