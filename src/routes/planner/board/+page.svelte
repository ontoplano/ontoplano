<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { autofocus } from '$lib/actions/autofocus.js';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import { RATINGS, type Rating } from '$lib/ratings.js';
	import { STATUSES, STATUS_LABELS, TIMING_LABELS, type Status } from '$lib/task-status.js';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Card = PageServerData['todayCards'][number];

	let tab: 'today' | 'general' = $state('today');
	let maxEnergy: number | null = $state(null);
	let sortBy: 'default' | Rating = $state('default');
	let showDone = $state(false);

	// Keyboard focus is a (column, row) pair rather than a flat index, because
	// the board is two-dimensional and hjkl has to mean the same thing here as
	// it does everywhere else in the app.
	let focusCol = $state(0);
	let focusRow = $state(0);
	let showForm = $state(false);
	let formRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		energy: null
	});
	let confirmingDelete: string | null = $state(null);
	let dragging: Card | null = $state(null);
	let dragOverColumn: Status | null = $state(null);
	let railOver = $state(false);

	const cards = $derived(tab === 'today' ? data.todayCards : data.generalCards);
	/** The rail beside Today always shows the todo list, whatever the tab. */
	const railCards = $derived(data.generalCards);

	function visible(status: Status): Card[] {
		let out = cards.filter((c) => c.status === status);

		// An unrated card is never hidden: the filter is for choosing among what
		// you have described, not for burying what you have not.
		if (maxEnergy !== null) {
			out = out.filter((c) => c.ratings.energy === null || c.ratings.energy <= maxEnergy!);
		}

		if (sortBy === 'default') {
			return [...out].sort((a, b) => {
				// Scheduled work keeps clock order; loose todos follow in their own.
				if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
				if (a.startTime) return -1;
				if (b.startTime) return 1;
				return a.sortOrder - b.sortOrder;
			});
		}

		const key: Rating = sortBy;
		const ascending = key === 'energy';
		return [...out].sort((a, b) => {
			const av = a.ratings[key];
			const bv = b.ratings[key];
			if (av === null && bv === null) return a.sortOrder - b.sortOrder;
			if (av === null) return 1;
			if (bv === null) return -1;
			return ascending ? av - bv : bv - av;
		});
	}

	const columns = $derived(
		STATUSES.filter((s) => showDone || s !== 'skipped').map((status) => ({
			status,
			cards: visible(status)
		}))
	);

	const focusedCard = $derived(columns[focusCol]?.cards[focusRow] ?? null);

	function post(action: string, fields: Record<string, string | string[]>) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) {
			if (Array.isArray(v)) v.forEach((one) => body.append(k, one));
			else body.set(k, v);
		}
		// SvelteKit names an action with `?/name`, or `&/name` when the URL already
		// carries query parameters — the board always does once you page to
		// another day.
		const query = location.search ? `${location.search}&/${action}` : `?/${action}`;
		return fetch(`${location.pathname}${query}`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
	}

	async function move(card: Card, status: Status) {
		if (card.status === status) return;
		// Optimistic: the card jumps immediately and the load re-runs behind it.
		card.status = status;
		await post('setStatus', { kind: card.kind, id: String(card.id), status });
		await refresh();
	}

	/**
	 * A todo dragged onto a day stops being a todo: it becomes a real block with
	 * a time, which is what puts it on the grid, in the tracker, and against a
	 * goal. Dragging a one-off back undoes exactly that.
	 */
	async function promote(card: Card, date: string, status: Status) {
		if (card.kind !== 'todo') return;
		await post('promote', { id: String(card.id), date, status });
		await refresh();
	}

	async function demote(card: Card) {
		if (card.kind !== 'instance') return;
		await post('demote', { id: String(card.id) });
		await refresh();
	}

	async function reorder(status: Status, orderedIds: number[]) {
		if (orderedIds.length === 0) return;
		await post('reorder', { todoId: orderedIds.map(String) });
		await refresh();
	}

	function refresh() {
		return goto(`/planner/board?date=${data.date}`, {
			invalidateAll: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function onDragStart(card: Card, e: DragEvent) {
		dragging = card;
		e.dataTransfer?.setData('text/plain', card.uid);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragEnd() {
		dragging = null;
		dragOverColumn = null;
		railOver = false;
	}

	/** Dropping a scheduled one-off back on the rail turns it into a todo again. */
	async function onDropInRail(e: DragEvent) {
		e.preventDefault();
		const card = dragging;
		railOver = false;
		dragging = null;
		if (card?.kind === 'instance') await demote(card);
	}

	async function onDropInColumn(status: Status, e: DragEvent) {
		e.preventDefault();
		const card = dragging;
		dragOverColumn = null;
		dragging = null;
		if (!card) return;

		// A todo landing in a day column becomes a scheduled task in that column,
		// in one gesture.
		if (card.kind === 'todo') {
			await promote(card, data.date, status);
			return;
		}
		await move(card, status);
	}

	/** Drop onto a specific card: same column means reorder, else it is a move. */
	async function onDropOnCard(target: Card, status: Status, e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const card = dragging;
		dragging = null;
		dragOverColumn = null;
		if (!card || card.uid === target.uid) return;

		if (card.status !== status) {
			await move(card, status);
			return;
		}

		// Only todos carry a position. An occurrence's place in the column is its
		// time of day, and a drag must not put the board and the calendar into
		// disagreement about the same task.
		if (card.kind !== 'todo') return;

		const todos = visible(status).filter((c) => c.kind === 'todo');
		const ids = todos.map((c) => c.id).filter((id) => id !== card.id);
		const at = todos.findIndex((c) => c.uid === target.uid);
		ids.splice(at === -1 ? ids.length : at, 0, card.id);
		await reorder(status, ids);
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
			confirmingDelete = null;
			return;
		}

		if (e.key === 'n') {
			e.preventDefault();
			openForm();
			return;
		}

		if (e.key === 'g') {
			e.preventDefault();
			tab = tab === 'today' ? 'general' : 'today';
			focusRow = 0;
			return;
		}

		if (e.key === 'h' || e.key === 'l') {
			e.preventDefault();
			const next = e.key === 'l' ? focusCol + 1 : focusCol - 1;
			focusCol = Math.min(Math.max(next, 0), columns.length - 1);
			focusRow = Math.min(focusRow, Math.max(columns[focusCol].cards.length - 1, 0));
			return;
		}

		if (e.key === 'j' || e.key === 'k') {
			e.preventDefault();
			const len = columns[focusCol]?.cards.length ?? 0;
			if (len === 0) return;
			focusRow = Math.min(Math.max(focusRow + (e.key === 'j' ? 1 : -1), 0), len - 1);
			return;
		}

		const card = focusedCard;
		if (!card) return;

		// Shift+H/L carries the focused card to the neighbouring column, which is
		// the keyboard's version of a drag.
		if (e.key === 'H' || e.key === 'L') {
			e.preventDefault();
			const delta = e.key === 'L' ? 1 : -1;
			const target = columns[focusCol + delta];
			if (target) {
				move(card, target.status);
				focusCol += delta;
				focusRow = 0;
			}
			return;
		}

		if (e.key >= '1' && e.key <= '5') {
			e.preventDefault();
			// Cycles urgency by default; interest and energy sit behind u/i/e.
			const value = Number(e.key);
			post('setRatings', {
				kind: card.kind,
				id: String(card.id),
				[ratingKey]: String(value)
			}).then(refresh);
			return;
		}

		if (e.key === 'u' || e.key === 'i' || e.key === 'y') {
			e.preventDefault();
			ratingKey = e.key === 'u' ? 'urgency' : e.key === 'i' ? 'interest' : 'energy';
			return;
		}

		if (e.key === 'c') {
			e.preventDefault();
			move(card, card.status === 'done' ? 'todo' : 'done');
			return;
		}

		if (e.key === 't') {
			e.preventDefault();
			if (card.kind === 'todo') promote(card, data.date, card.status);
			else demote(card);
			return;
		}

		if (e.key === 'x' && card.kind === 'todo') {
			e.preventDefault();
			if (confirmingDelete === card.uid) {
				post('deleteTodo', { kind: 'todo', id: String(card.id) }).then(refresh);
				confirmingDelete = null;
			} else {
				confirmingDelete = card.uid;
			}
		}
	}

	/** Which rating the number keys write to; switched with u / i / y. */
	let ratingKey: Rating = $state('urgency');

	function openForm() {
		showForm = true;
		formRatings = { urgency: null, interest: null, energy: null };
		tick();
	}

	function shiftDay(days: number) {
		const d = new Date(data.date + 'T00:00:00');
		d.setDate(d.getDate() + days);
		const pad = (n: number) => String(n).padStart(2, '0');
		goto(`/planner/board?date=${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-1">
			{#each [{ v: 'today', l: 'Today' }, { v: 'general', l: 'Todo' }] as t (t.v)}
				<button
					onclick={() => {
						tab = t.v as typeof tab;
						focusRow = 0;
					}}
					class="border-b-2 px-3 py-1.5 text-sm {tab === t.v
						? 'font-semibold text-gray-900'
						: 'border-transparent font-medium text-gray-500 hover:text-gray-900'}"
					style={tab === t.v ? 'border-color: var(--section-accent)' : ''}
				>
					{t.l}
				</button>
			{/each}
		</div>

		<div class="flex items-center gap-2">
			{#if tab === 'today'}
				<button
					onclick={() => shiftDay(-1)}
					class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
					aria-label="Previous day">&larr;</button
				>
				<span class="tabular text-sm text-gray-600">{data.date}</span>
				<button
					onclick={() => shiftDay(1)}
					class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
					aria-label="Next day">&rarr;</button
				>
			{/if}
			<button
				onclick={openForm}
				class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
			>
				New <kbd class="ml-1 border border-gray-600 bg-gray-800 px-1 text-xs">n</kbd>
			</button>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
		<div class="flex items-center gap-1">
			<span class="eyebrow text-gray-500">Sort</span>
			{#each [{ v: 'default', l: 'Default' }, { v: 'urgency', l: 'Urgency' }, { v: 'interest', l: 'Interest' }, { v: 'energy', l: 'Energy' }] as opt (opt.v)}
				<button
					onclick={() => (sortBy = opt.v as typeof sortBy)}
					class="border px-2 py-0.5 {sortBy === opt.v
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'}">{opt.l}</button
				>
			{/each}
		</div>

		<div class="flex items-center gap-1">
			<span class="eyebrow text-gray-500">Energy up to</span>
			{#each [1, 2, 3, 4, 5] as n (n)}
				<button
					onclick={() => (maxEnergy = maxEnergy === n ? null : n)}
					class="tabular h-6 w-6 border {maxEnergy === n
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-500 hover:text-gray-900'}">{n}</button
				>
			{/each}
		</div>

		<label class="flex items-center gap-1 text-gray-600">
			<input type="checkbox" bind:checked={showDone} class="h-3 w-3" />
			Show skipped
		</label>

		<span class="kbd-hint text-gray-400">
			Number keys set <strong class="font-semibold text-gray-600">{ratingKey}</strong> — u / i / y to
			switch
		</span>
	</div>

	{#if showForm}
		<form
			method="post"
			action="?/createTodo"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					showForm = false;
				}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-card"
		>
			{#if tab === 'today'}
				<input type="hidden" name="scheduledDate" value={data.date} />
			{/if}
			<div class="flex flex-wrap gap-3">
				<label class="min-w-64 flex-1">
					<span class="eyebrow text-gray-500">Title</span>
					<input
						name="title"
						required
						use:autofocus
						autocomplete="off"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<label class="w-48">
					<span class="eyebrow text-gray-500">Category</span>
					<select
						name="categoryId"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						<option value="">— none —</option>
						{#each data.categories as cat (cat.id)}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="space-y-2 border border-gray-200 bg-gray-50 p-3">
				{#each RATINGS as r (r)}
					<RatingPicker rating={r} bind:value={formRatings[r]} />
				{/each}
			</div>
			<div class="flex gap-2">
				<button class="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
					>Add</button
				>
				<button
					type="button"
					onclick={() => (showForm = false)}
					class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>Cancel</button
				>
			</div>
		</form>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row">
		<div class="min-w-0 flex-1">
			<!-- Below md this is a snapping strip of readable columns rather than a
			     grid squeezed to fit: a 90px column is not a column. -->
			<div
				class="snap-strip md:grid md:gap-3"
				style="grid-template-columns: repeat({columns.length}, minmax(0, 1fr))"
			>
				{#each columns as column, ci (column.status)}
					<section
						class="flex min-h-64 w-[78vw] shrink-0 flex-col border bg-gray-50 sm:w-64 md:w-auto {dragOverColumn ===
						column.status
							? 'border-gray-900'
							: 'border-gray-200'}"
						ondragover={(e) => {
							e.preventDefault();
							dragOverColumn = column.status;
						}}
						ondragleave={() => {
							if (dragOverColumn === column.status) dragOverColumn = null;
						}}
						ondrop={(e) => onDropInColumn(column.status, e)}
					>
						<header
							class="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2"
						>
							<span class="eyebrow text-gray-500">{STATUS_LABELS[column.status]}</span>
							<span class="tabular text-xs text-gray-400">{column.cards.length}</span>
						</header>

						<div class="flex-1 space-y-2 p-2">
							{#each column.cards as card, ri (card.uid)}
								<article
									draggable="true"
									ondragstart={(e) => onDragStart(card, e)}
									ondragend={onDragEnd}
									ondrop={(e) => onDropOnCard(card, column.status, e)}
									ondragover={(e) => e.preventDefault()}
									onclick={() => {
										focusCol = ci;
										focusRow = ri;
									}}
									onkeydown={() => {}}
									role="button"
									tabindex="0"
									class="cursor-grab border bg-white p-2 shadow-card {focusCol === ci &&
									focusRow === ri
										? 'ring-2 ring-gray-900 ring-inset'
										: ''} {dragging?.uid === card.uid ? 'opacity-40' : ''} border-gray-200"
								>
									<div class="flex items-start gap-2">
										<span
											class="mt-0.5 h-3 w-1 shrink-0"
											style="background-color: {card.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
											title={card.categoryName ?? 'No category'}
										></span>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm text-gray-900">{card.title}</p>
											<div class="mt-1 flex flex-wrap items-center gap-2">
												{#if card.startTime}
													<span class="tabular font-mono text-[10px] text-gray-500"
														>{card.startTime}</span
													>
												{/if}
												{#if card.kind === 'todo' && card.scheduledDate && card.scheduledDate < data.date}
													<span class="text-[10px] text-gray-500">carried over</span>
												{/if}
												{#if card.timing === 'early' || card.timing === 'late'}
													<span class="text-[10px] text-gray-500">{TIMING_LABELS[card.timing]}</span
													>
												{/if}
												<RatingBadges values={card.ratings} />
											</div>
										</div>
									</div>
								</article>
							{/each}

							{#if column.cards.length === 0}
								<p class="px-1 py-4 text-center text-xs text-gray-400">
									{dragOverColumn === column.status ? 'Drop here' : 'Nothing here'}
								</p>
							{/if}
						</div>
					</section>
				{/each}
			</div>
		</div>

		{#if tab === 'today'}
			<!-- The todo list stays visible beside Today so the two can actually
			     interact: drag one across and it becomes a scheduled task. -->
			<aside
				class="w-full shrink-0 border bg-gray-50 md:w-56 {railOver
					? 'border-gray-900'
					: 'border-gray-200'}"
				ondragover={(e) => {
					e.preventDefault();
					railOver = true;
				}}
				ondragleave={() => (railOver = false)}
				ondrop={(e) => onDropInRail(e)}
			>
				<header
					class="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2"
				>
					<span class="eyebrow text-gray-500">Todo</span>
					<span class="tabular text-xs text-gray-400">{railCards.length}</span>
				</header>
				<div class="space-y-2 p-2">
					{#each railCards as card (card.uid)}
						<article
							draggable="true"
							ondragstart={(e) => onDragStart(card, e)}
							ondragend={onDragEnd}
							ondragover={(e) => e.preventDefault()}
							class="lift cursor-grab border border-gray-200 bg-white p-2 shadow-card {dragging?.uid ===
							card.uid
								? 'opacity-40'
								: ''}"
						>
							<div class="flex items-start gap-2">
								<span
									class="mt-0.5 h-3 w-1 shrink-0"
									style="background-color: {card.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
									title={card.categoryName ?? 'No category'}
								></span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm text-gray-900">{card.title}</p>
									<RatingBadges values={card.ratings} class="mt-1" />
								</div>
							</div>
						</article>
					{/each}

					{#if railCards.length === 0}
						<p class="px-1 py-6 text-center text-xs text-gray-400">
							{railOver ? 'Drop to send back' : 'Nothing waiting'}
						</p>
					{/if}
				</div>
			</aside>
		{/if}
	</div>

	<p class="kbd-hint text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">h</kbd>
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>
		<kbd class="border border-gray-300 bg-gray-50 px-1">k</kbd>
		<kbd class="border border-gray-300 bg-gray-50 px-1">l</kbd> move ·
		<kbd class="border border-gray-300 bg-gray-50 px-1">H</kbd>
		<kbd class="border border-gray-300 bg-gray-50 px-1">L</kbd> carry card ·
		<kbd class="border border-gray-300 bg-gray-50 px-1">c</kbd> done ·
		<kbd class="border border-gray-300 bg-gray-50 px-1">t</kbd> today ·
		<kbd class="border border-gray-300 bg-gray-50 px-1">g</kbd> switch tab ·
		<kbd class="border border-gray-300 bg-gray-50 px-1">1-5</kbd> rate ·
		<kbd class="border border-gray-300 bg-gray-50 px-1">x</kbd> delete
	</p>
</div>
