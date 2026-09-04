<script lang="ts">
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import NoteFields from '$lib/components/fields/NoteFields.svelte';
	import { resolve } from '$app/paths';
	import { renderMarkdown } from '$lib/markdown';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let showWinsForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);
	let filterTag: string | null = $state(null);
	let confirmingDeleteId: number | null = $state(null);
	let winInputCount = $state(3);
	const winsEnabled = $derived(data.winsEnabled);

	// Tooltip state for #N references
	let tooltip = $state<{ visible: boolean; x: number; y: number; content: string; date: string }>({
		visible: false,
		x: 0,
		y: 0,
		content: '',
		date: ''
	});

	function seqMap() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, read once and thrown away inside this function; nothing tracks it.
		const map = new Map<number, { content: string; createdAt: string }>();
		for (const entry of data.entries) {
			map.set(entry.seq, { content: entry.content, createdAt: entry.createdAt });
		}
		return map;
	}

	function filteredEntries() {
		if (!filterTag) return data.entries;
		return data.entries.filter((e) => e.tags.some((t) => t.name === filterTag));
	}

	function editingEntry() {
		if (!editingId) return null;
		return data.entries.find((e) => e.id === editingId) ?? null;
	}

	function editingPeopleString(): string {
		const entry = editingEntry();
		return entry ? entry.people.map((p) => p.name).join(', ') : '';
	}

	function editingTagString() {
		const entry = editingEntry();
		if (!entry) return '';
		return entry.tags.map((t) => t.name).join(', ');
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDateShort(iso: string): string {
		return iso.slice(0, 10);
	}

	function handleEntriesPointerOver(e: PointerEvent) {
		const target = (e.target as HTMLElement).closest('.diary-ref') as HTMLElement | null;
		if (!target) return;
		const seq = Number(target.dataset.seq);
		const entry = seqMap().get(seq);
		if (!entry) return;
		const rect = target.getBoundingClientRect();
		const preview = entry.content.length > 120 ? entry.content.slice(0, 120) + '…' : entry.content;
		tooltip = {
			visible: true,
			x: rect.left,
			y: rect.top,
			content: preview,
			date: formatDateShort(entry.createdAt)
		};
	}

	function handleEntriesPointerOut(e: PointerEvent) {
		const target = (e.target as HTMLElement).closest('.diary-ref');
		if (!target) return;
		tooltip.visible = false;
	}

	function handleEntriesClick(e: MouseEvent) {
		const target = (e.target as HTMLElement).closest('.diary-ref') as HTMLElement | null;
		if (!target) return;
		e.preventDefault();
		const seq = Number(target.dataset.seq);
		const el = document.getElementById(`diary-${seq}`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// Briefly highlight
			el.classList.add('ring-2', 'ring-amber-400');
			setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 1500);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// A `<dialog>` closes itself on Escape; `preventDefault()` here cancels
			// that. Nothing on this page needs the key while one is open.
			if (document.querySelector('dialog[open]')) return;

			e.preventDefault();
			showForm = false;
			showWinsForm = false;
			editingId = null;
			confirmingDeleteId = null;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const items = filteredEntries();
		const action = getAction('/diary', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				break;
			case 'navigate-up':
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'new':
				showForm = true;
				showWinsForm = false;
				editingId = null;
				tick().then(() => {
					const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
					ta?.focus();
				});
				break;
			case 'edit':
				if (items.length > 0) {
					editingId = items[selectedIndex].id;
					showForm = true;
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
						ta?.focus();
					});
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<!-- The heading is the layout's — Notes, with the Diary tab lit. This row
	     only holds the page's own buttons, pushed to the end. -->
	<div class="flex flex-wrap items-center justify-end gap-3">
		<div class="flex flex-wrap items-center gap-2">
			{#if winsEnabled}
				<button
					onclick={() => {
						showWinsForm = !showWinsForm;
						showForm = false;
						editingId = null;
						winInputCount = 3;
					}}
					class="btn btn-sm"
					data-tour="diary-wins"
				>
					{showWinsForm ? 'Cancel' : 'New wins'}
				</button>
			{/if}
			<button
				onclick={() => {
					showForm = !showForm;
					showWinsForm = false;
					editingId = null;
					if (!showForm) return;
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
						ta?.focus();
					});
				}}
				class="btn btn-sm"
				data-tour="diary-new"
			>
				{showForm ? 'Cancel' : 'New entry'}
			</button>
		</div>
	</div>

	{#if data.allTags.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each data.allTags as tag (tag.id)}
				<button
					onclick={() => {
						filterTag = filterTag === tag.name ? null : tag.name;
						selectedIndex = 0;
					}}
					class="chip {filterTag === tag.name
						? 'border-amber-500 bg-amber-50 text-amber-700'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					#{tag.name}
				</button>
			{/each}
			{#if filterTag}
				<button
					onclick={() => {
						filterTag = null;
						selectedIndex = 0;
					}}
					class="chip text-gray-500 hover:text-gray-600"
				>
					clear
				</button>
			{/if}
		</div>
	{/if}

	<FormError message={form?.message} />

	{#if winsEnabled && showWinsForm}
		<form
			method="post"
			action="?/createWins"
			use:enhance={() => {
				return async ({ update }) => {
					await update({ reset: false });
					showWinsForm = false;
					winInputCount = 3;
				};
			}}
			class="lift space-y-3 border border-gray-200 bg-white p-4 shadow-card"
		>
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-gray-700">Wins</span>
				<input
					autocomplete="off"
					name="forDate"
					type="date"
					value={new Date().toISOString().slice(0, 10)}
					class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</div>
			{#each { length: winInputCount }, i (i)}
				<input
					autocomplete="off"
					name="win_{i}"
					type="text"
					placeholder="Win {i + 1}"
					class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			{/each}
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={() => (winInputCount += 1)}
					class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
				>
					+ Add another
				</button>
			</div>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Tags</span>
				<input
					autocomplete="off"
					name="tags"
					type="text"
					placeholder="tags, commas or spaces"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<div class="flex items-center gap-2">
				<button type="submit" class="btn btn-primary"> Save Wins </button>
				<button
					type="button"
					onclick={() => {
						showWinsForm = false;
						winInputCount = 3;
					}}
					class="btn"
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? 'Edit entry' : 'New entry'}
		onclose={() => (editingId = null)}
	>
		<form
			id="entry-form"
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
				<NoteFields
					content={editingId ? (editingEntry()?.content ?? '') : ''}
					tags={editingId ? editingTagString() : ''}
					notebooks={data.notebooks}
				/>

				<Field label="People" span={6} hint="Anyone this was about.">
					<input
						autocomplete="off"
						name="people"
						type="text"
						list="known-people"
						value={editingId ? editingPeopleString() : ''}
						placeholder="Ana, João"
						class="input"
					/>
					<datalist id="known-people">
						{#each data.allPeople as person (person.id)}
							<option value={person.name}></option>
						{/each}
					</datalist>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button
				type="button"
				class="btn"
				onclick={() => {
					showForm = false;
					editingId = null;
				}}>Cancel</button
			>
			<button type="submit" form="entry-form" class="btn btn-primary">
				{editingId ? 'Save' : 'Post entry'}
			</button>
		{/snippet}
	</Modal>

	{#if filteredEntries().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if filterTag}
				<EmptyState icon="diary" title="No entries with #{filterTag}" />
			{:else}
				<EmptyState
					icon="diary"
					title="The journal is empty"
					description="Whatever happened today, in as many or as few words as you like."
				>
					{#snippet action()}
						<button onclick={() => (showForm = true)} class="btn btn-primary">
							<Icon name="plus" /> New entry
						</button>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
		<div
			class="space-y-3"
			data-tour="diary-list"
			onpointerover={handleEntriesPointerOver}
			onpointerout={handleEntriesPointerOut}
			onclick={handleEntriesClick}
		>
			{#each filteredEntries() as entry, i (entry.id)}
				<div
					use:keepInView={i === selectedIndex}
					id="diary-{entry.seq}"
					class="lift relative border border-gray-200 bg-white p-4 shadow-card transition-all {i ===
					selectedIndex
						? 'kb-cursor'
						: ''}"
				>
					<div class="md mb-2 text-sm text-gray-900">
						<!-- `renderMarkdown` escapes every character of the input before it emits a
						     tag, and emits only attributes it writes itself. See `$lib/markdown.ts`. -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderMarkdown(entry.content)}
					</div>

					<!--
						One footer row: what the entry is on the left, what you can do to it
						on the right. Edit and Delete used to sit beside the writing and
						refuse to shrink, which on a phone left the writing a column one
						word wide — and cost a whole row of height on any screen.
					-->
					<div class="flex flex-wrap items-center gap-2">
						<!-- The number entries are referred to by, as `#12` in another
						     entry's text. It was in the corner, which put it under the
						     buttons once they moved down here. -->
						<span class="tabular text-xs font-medium text-gray-900">#{entry.seq}</span>
						<span class="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>
						{#if entry.forDate}
							<span class="text-xs font-medium text-amber-600">for {entry.forDate}</span>
						{/if}
						{#if entry.updatedAt !== entry.createdAt}
							<span class="text-xs text-gray-500">· edited {formatDate(entry.updatedAt)}</span>
						{/if}
						<!--
							`@` in front of a person, the way `#` goes in front of a tag.

							They are the same chip in the same row and they were telling
							you two different kinds of thing with nothing to say which:
							"Ana" beside "#running" reads as another tag until you know
							the people list. One character, and the row is legible without
							knowing anything.
						-->
						{#each entry.people as person (person.id)}
							<a href={resolve('/diary/people')} class="chip">
								@{person.name}
							</a>
						{/each}
						{#each entry.tags as tag (tag.id)}
							<button
								onclick={() => {
									filterTag = tag.name;
									selectedIndex = 0;
								}}
								class="chip"
							>
								#{tag.name}
							</button>
						{/each}

						<div class="ml-auto flex flex-wrap items-center gap-2">
							{#if confirmingDeleteId === entry.id}
								<form
									method="post"
									action="?/delete"
									use:enhance={() => {
										return async ({ update }) => {
											await update({ reset: false });
											confirmingDeleteId = null;
										};
									}}
								>
									<input type="hidden" name="id" value={entry.id} />
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
										confirmingDeleteId = null;
									}}
									class="btn btn-sm"
								>
									Cancel
								</button>
							{:else}
								<button
									title="Edit"
									aria-label="Edit"
									onclick={() => {
										editingId = entry.id;
										showForm = true;
										tick().then(() => {
											const ta = document.querySelector<HTMLTextAreaElement>(
												'textarea[name="content"]'
											);
											ta?.focus();
										});
									}}
									class="btn btn-sm"
								>
									<Icon name="edit" />
								</button>
								<button
									title="Delete"
									aria-label="Delete"
									type="button"
									onclick={() => {
										confirmingDeleteId = entry.id;
									}}
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
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

{#if tooltip.visible}
	<div
		class="pointer-events-none fixed z-50 max-w-xs border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm"
		style="left: {tooltip.x}px; top: {tooltip.y - 8}px; transform: translateY(-100%);"
	>
		<div class="mb-1 font-medium text-gray-500">{tooltip.date}</div>
		<div class="text-gray-700">{tooltip.content}</div>
	</div>
{/if}

<style>
	:global(.diary-ref) {
		color: #d97706;
		text-decoration: underline;
		text-decoration-color: #fde68a;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	:global(.diary-ref:hover) {
		color: #b45309;
		text-decoration-color: #d97706;
	}
</style>
