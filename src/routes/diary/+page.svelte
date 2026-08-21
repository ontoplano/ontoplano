<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let showWinsForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);
	let filterTag: string | null = $state(null);
	let confirmingDeleteId: number | null = $state(null);
	let winInputCount = $state(3);
	const winsEnabled = $derived(Boolean(data.features?.['feature.threeWins']));

	// Tooltip state for #N references
	let tooltip = $state<{ visible: boolean; x: number; y: number; content: string; date: string }>({
		visible: false,
		x: 0,
		y: 0,
		content: '',
		date: ''
	});

	function seqMap() {
		const map = new Map<number, { content: string; createdAt: string }>();
		for (const entry of data.entries) {
			map.set(entry.seq, { content: entry.content, createdAt: entry.createdAt });
		}
		return map;
	}

	function renderMarkdown(text: string): string {
		let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
		html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
		html = html.replace(/_(.+?)_/g, '<em>$1</em>');
		html = html.replace(/`(.+?)`/g, '<code>$1</code>');
		html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
		// Turn #N (numeric) into diary entry reference links
		html = html.replace(
			/(^|[\s(])#(\d+)\b/g,
			'$1<a class="diary-ref" data-seq="$2" href="#diary-$2">#$2</a>'
		);
		html = html.replace(/\n/g, '<br>');
		return html;
	}

	function filteredEntries() {
		if (!filterTag) return data.entries;
		return data.entries.filter((e) => e.tags.some((t) => t.name === filterTag));
	}

	function editingEntry() {
		if (!editingId) return null;
		return data.entries.find((e) => e.id === editingId) ?? null;
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
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Diary</h1>
		<div class="flex items-center gap-2">
			{#if winsEnabled}
				<button
					onclick={() => {
						showWinsForm = !showWinsForm;
						showForm = false;
						editingId = null;
						winInputCount = 3;
					}}
					class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
				>
					{showWinsForm ? 'Cancel' : 'New Wins'}
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
				class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
			>
				{showForm ? 'Cancel' : 'New Entry'}
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
					class="border px-2 py-0.5 text-xs transition {filterTag === tag.name
						? 'border-amber-500 bg-amber-50 text-amber-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
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
					class="border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-400 transition hover:text-gray-600"
				>
					clear
				</button>
			{/if}
		</div>
	{/if}

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if winsEnabled && showWinsForm}
		<form
			method="post"
			action="?/createWins"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showWinsForm = false;
					winInputCount = 3;
				};
			}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
		>
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-gray-700">Wins</span>
				<input
					name="forDate"
					type="date"
					value={new Date().toISOString().slice(0, 10)}
					class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</div>
			{#each { length: winInputCount } as _, i}
				<input
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
					name="tags"
					type="text"
					placeholder="optional extra tags"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<div class="flex items-center gap-2">
				<button
					type="submit"
					class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Save Wins
				</button>
				<button
					type="button"
					onclick={() => {
						showWinsForm = false;
						winInputCount = 3;
					}}
					class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	{#if showForm}
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
				<span class="text-sm font-medium text-gray-700">Content</span>
				<textarea
					name="content"
					required
					rows="4"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>{editingId ? (editingEntry()?.content ?? '') : ''}</textarea
				>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Tags</span>
				<input
					name="tags"
					type="text"
					value={editingId ? editingTagString() : ''}
					placeholder="comma separated, e.g. health, work, idea"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<div class="flex items-center gap-2">
				<button
					type="submit"
					class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					{editingId ? 'Update' : 'Post'}
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

	{#if filteredEntries().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if filterTag}
				No entries with tag #{filterTag}.
			{:else}
				No diary entries yet. Write your first one.
			{/if}
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
		<div
			class="space-y-3"
			onpointerover={handleEntriesPointerOver}
			onpointerout={handleEntriesPointerOut}
			onclick={handleEntriesClick}
		>
			{#each filteredEntries() as entry, i (entry.id)}
				<div
					id="diary-{entry.seq}"
					class="relative border border-gray-200 bg-white p-4 shadow-sm transition-all {i ===
					selectedIndex
						? 'border-l-4 border-l-amber-300/60 ring-2 ring-amber-400 ring-inset'
						: ''}"
				>
					<div class="mb-2 flex items-start justify-between gap-4">
						<p class="text-sm text-gray-900">{@html renderMarkdown(entry.content)}</p>
						<div class="flex shrink-0 items-center gap-2">
							{#if confirmingDeleteId === entry.id}
								<form
									method="post"
									action="?/delete"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											confirmingDeleteId = null;
										};
									}}
								>
									<input type="hidden" name="id" value={entry.id} />
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
										confirmingDeleteId = null;
									}}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								>
									Cancel
								</button>
							{:else}
								<button
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
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								>
									Edit
								</button>
								<button
									type="button"
									onclick={() => {
										confirmingDeleteId = entry.id;
									}}
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
								>
									Delete
								</button>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs text-gray-400">{formatDate(entry.createdAt)}</span>
						{#if entry.forDate}
							<span class="text-xs font-medium text-amber-600">for {entry.forDate}</span>
						{/if}
						{#if entry.updatedAt !== entry.createdAt}
							<br /><span class="text-xs text-gray-400">
								Edited: {formatDate(entry.updatedAt)}</span
							>
						{/if}
						{#if entry.tags.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each entry.tags as tag (tag.id)}
									<button
										onclick={() => {
											filterTag = tag.name;
											selectedIndex = 0;
										}}
										class="border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600 transition hover:bg-gray-100"
									>
										#{tag.name}
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<span class="absolute right-2 bottom-1.5 text-[10px] text-black tabular-nums"
						>#{entry.seq}</span
					>
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
