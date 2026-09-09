<script lang="ts">
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import { enhance } from '$app/forms';
	import { armed } from '$lib/actions/armed';
	import { focusHere } from '$lib/actions/autofocus';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Backlinks from '$lib/components/Backlinks.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import { RATINGS, type Rating } from '$lib/ratings.js';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { CLOSED_STATUSES, STATUSES, STATUS_LABELS, type Status } from '$lib/task-status.js';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';

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

	/** How many of the folded-away ratings currently carry a value. */
	const ratingsSet = $derived(Object.values(formRatings).filter((v) => v !== null).length);

	/**
	 * The card being edited.
	 *
	 * This is what Track was: an occurrence's time, its length, what it actually
	 * turned out to be, and what to call this one. Same object as the card on the
	 * board, so it is the same card's editor rather than a second page.
	 */
	let editing: Card | null = $state(null);
	let editRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		energy: null
	});
	const editRatingsSet = $derived(Object.values(editRatings).filter((v) => v !== null).length);

	function openEditor(card: Card) {
		editing = card;
		editRatings = { ...card.ratings };
	}

	/** A finished block that only ever named a category still owes an answer. */
	function needsResolution(card: Card): boolean {
		return (
			card.kind === 'instance' &&
			card.mode === 'category' &&
			card.status === 'done' &&
			!card.activityId
		);
	}

	function formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}m`;
		return m === 0 ? `${h}h` : `${h}h ${m}m`;
	}

	/**
	 * How the day adds up, by category.
	 *
	 * The one thing the tracker showed that a column of cards does not: where
	 * the hours went.
	 */
	const dayTotals = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, read once and thrown away inside this function; nothing tracks it.
		const totals = new Map<string, { color: string; minutes: number }>();

		for (const card of data.todayCards) {
			const name = card.categoryName;
			if (!name) continue;
			const current = totals.get(name) ?? {
				color: card.categoryColor ?? CATEGORY_FALLBACK_COLOR,
				minutes: 0
			};
			current.minutes += card.durationMinutes;
			totals.set(name, current);
		}

		return [...totals.entries()].map(([name, v]) => ({ name, ...v }));
	});
	let confirmingDelete: string | null = $state(null);
	let dragging: Card | null = $state(null);
	let dragOverColumn: Status | null = $state(null);
	let railOver = $state(false);

	const cards = $derived(tab === 'today' ? data.todayCards : data.generalCards);
	/**
	 * The rail beside Today always shows the todo list, whatever the tab.
	 *
	 * Open ones only. The General tab sorts every undated todo into its status
	 * column, where a finished one belongs under Done; the rail is a single
	 * list with no column to put it in, so everything ever ticked off sat in it
	 * forever — a todo list that only grows is not a todo list.
	 */
	const railCards = $derived(data.generalCards.filter((c) => !CLOSED_STATUSES.includes(c.status)));

	/** Only on a phone; a wide screen shows the filters without asking. */
	let filtersOpen = $state(false);

	/**
	 * Which column a card is drawn in right now.
	 *
	 * A tick is held for the undo window rather than sent, so between the tap and
	 * the write there is nothing on the server to read. Derived rather than
	 * written onto the card, because Undo has to put it back where it was and a
	 * mutation would have already lost that.
	 */
	function shownStatus(card: Card): Status {
		return isPending(card.uid) ? 'done' : card.status;
	}

	function visible(status: Status): Card[] {
		let out = cards.filter((c) => shownStatus(c) === status);

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

	/**
	 * On a phone the board is one column at a time.
	 *
	 * It used to be a sideways snapping strip of them, which is the standard
	 * answer and the wrong one here: the columns are as tall as the tallest, so a
	 * busy Doing in the middle made getting from Pending to Done a scroll through
	 * a screen and a half of somebody else's cards. Three columns are not enough
	 * to be worth navigating — they are enough to be named.
	 */
	let phoneColumn: Status = $state('todo');

	// Hiding Skipped while it is the one on screen would leave a blank board.
	$effect(() => {
		if (!columns.some((c) => c.status === phoneColumn)) phoneColumn = 'todo';
	});

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
		// A second tick inside the window is the same gesture as pressing Undo.
		if (isPending(card.uid)) {
			cancelFor(card.uid);
			return;
		}
		if (card.status === status) return;

		const send = async () => {
			await post('setStatus', { kind: card.kind, id: String(card.id), status });
			await refresh();
		};

		/*
		 * Answering for a thing is the move worth a few seconds to take back.
		 *
		 * Both answers, not only the good one. Skipping was the one without a net
		 * and it is the more expensive mistake: "done" pressed by accident is a
		 * tick you can untick, and "skipped" pressed by accident is a week that
		 * now says you did not do something you did.
		 */
		if (status === 'done' || status === 'skipped') {
			const said = status === 'done' ? 'Completed' : 'Skipped';
			// Written now; Undo writes it back to todo. Held requests made the
			// card and the rest of the board disagree for the length of a toast.
			changeNow(
				card.uid,
				`${said} ${card.title}`,
				() => send(),
				async () => {
					await post('setStatus', { kind: card.kind, id: String(card.id), status: 'todo' });
					await refresh();
				}
			);
			return;
		}

		// Optimistic: the card jumps immediately and the load re-runs behind it.
		card.status = status;
		await send();
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
		return goto(resolve(`/tasks/board?date=${data.date}`), {
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
			editing = null;
			confirmingDelete = null;
			return;
		}

		// While a card is asking whether to delete it, the keyboard belongs to
		// that question. Without this, Enter would answer it *and* open the
		// editor behind it, because both read the same keystroke.
		if (confirmingDelete) return;

		// Every other key answers to the registry in $lib/shortcuts.ts — the
		// binding lives there, only the behaviour lives here.
		const action = getAction('/tasks/board', e.key);
		if (!action) return;

		switch (action) {
			case 'edit': {
				const card = columns[focusCol]?.cards[focusRow];
				if (!card) return;
				e.preventDefault();
				openEditor(card);
				return;
			}
			case 'new':
				e.preventDefault();
				openForm();
				return;
			case 'switch-tab':
				e.preventDefault();
				tab = tab === 'today' ? 'general' : 'today';
				focusRow = 0;
				return;
			case 'prev-column':
			case 'next-column': {
				e.preventDefault();
				const next = action === 'next-column' ? focusCol + 1 : focusCol - 1;
				focusCol = Math.min(Math.max(next, 0), columns.length - 1);
				focusRow = Math.min(focusRow, Math.max(columns[focusCol].cards.length - 1, 0));
				return;
			}
			case 'next-card':
			case 'prev-card': {
				e.preventDefault();
				const len = columns[focusCol]?.cards.length ?? 0;
				if (len === 0) return;
				focusRow = Math.min(Math.max(focusRow + (action === 'next-card' ? 1 : -1), 0), len - 1);
				return;
			}
		}

		const card = focusedCard;
		if (!card) return;

		switch (action) {
			// Carrying the focused card to the neighbouring column is the
			// keyboard's version of a drag.
			case 'carry-left':
			case 'carry-right': {
				e.preventDefault();
				const delta = action === 'carry-right' ? 1 : -1;
				const target = columns[focusCol + delta];
				if (target) {
					move(card, target.status);
					focusCol += delta;
					focusRow = 0;
				}
				return;
			}
			case 'rate': {
				e.preventDefault();
				// Cycles urgency by default; interest and energy sit behind u/i/y.
				const value = Number(e.key);
				post('setRatings', {
					kind: card.kind,
					id: String(card.id),
					[ratingKey]: String(value)
				}).then(refresh);
				return;
			}
			case 'rate-urgency':
			case 'rate-interest':
			case 'rate-energy':
				e.preventDefault();
				ratingKey =
					action === 'rate-urgency'
						? 'urgency'
						: action === 'rate-interest'
							? 'interest'
							: 'energy';
				return;
			case 'toggle-done':
				e.preventDefault();
				move(card, card.status === 'done' ? 'todo' : 'done');
				return;
			case 'toggle-today':
				e.preventDefault();
				if (card.kind === 'todo') promote(card, data.date, card.status);
				else demote(card);
				return;
			case 'delete':
				if (card.kind !== 'todo') return;
				e.preventDefault();
				// Arms the card's confirmation; the delete itself is a click, and that
				// button ignores the first moments after it appears.
				confirmingDelete = card.uid;
				return;
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
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, read once and thrown away inside this function; nothing tracks it.
		const d = new Date(data.date + 'T00:00:00');
		d.setDate(d.getDate() + days);
		const pad = (n: number) => String(n).padStart(2, '0');
		goto(
			resolve(`/tasks/board?date=${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
		);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-1" data-tour="board-tabs">
			{#each [{ v: 'today', l: 'Today' }, { v: 'general', l: 'To-do' }] as t (t.v)}
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
				<button
					onclick={() => goto(resolve('/tasks/board'))}
					class="tabular border px-2 py-1 text-sm shadow-sm {data.date === data.today
						? 'border-gray-900 bg-gray-900 text-white'
						: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
				>
					{data.date === data.today ? 'Today' : data.date}
				</button>
				<button
					onclick={() => shiftDay(1)}
					class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
					aria-label="Next day">&rarr;</button
				>
			{/if}
			<button onclick={openForm} class="btn btn-primary btn-sm">
				New <kbd class="ml-1 border border-gray-600 bg-gray-800 px-1 text-xs"
					>{keyFor('/tasks/board', 'new')}</kbd
				>
			</button>
		</div>
	</div>

	<!-- Sort, energy and the rest are three rows on a phone before a single card.
	     They fold behind one button there and stay open on a wide screen. -->
	<button
		onclick={() => (filtersOpen = !filtersOpen)}
		class="btn btn-sm sm:hidden"
		aria-expanded={filtersOpen}
		data-tour="board-ratings"
	>
		{filtersOpen ? 'Hide filters' : 'Filters'}
	</button>

	<div
		class="{filtersOpen ? 'flex' : 'hidden'} flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:flex"
		data-tour="board-ratings"
	>
		<div class="flex items-center gap-1">
			<span class="eyebrow text-gray-600">Sort</span>
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
			<span class="eyebrow text-gray-600">Energy up to</span>
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

		<span class="kbd-hint text-gray-500">
			Number keys set <strong class="font-semibold text-gray-600">{ratingKey}</strong> — u / i / y to
			switch
		</span>
	</div>

	<Modal bind:open={showForm} error={form?.message} title="New card" size="sm">
		<form
			id="card-form"
			method="post"
			action="?/createTodo"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') showForm = false;
				}}
		>
			{#if tab === 'today'}
				<input type="hidden" name="scheduledDate" value={data.date} />
			{/if}

			<FormGrid>
				<Field label="Title" span={12} required>
					<OneLine name="heading" class="input" required />
				</Field>

				<Field label="Category" span={12}>
					<select name="categoryId" class="select">
						<option value="">— none —</option>
						{#each data.categories as cat (cat.id)}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
				</Field>

				<MoreOptions label="Urgency, interest, energy" count={ratingsSet}>
					{#each RATINGS as r (r)}
						<div class="col-span-12">
							<RatingPicker rating={r} bind:value={formRatings[r]} />
						</div>
					{/each}
				</MoreOptions>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
			<button type="submit" form="card-form" class="btn btn-primary">Add card</button>
		{/snippet}
	</Modal>

	<!--
		One card, everything about it.

		A block on the board answers for its own time, length and identity here,
		which is what the Track page used to be for. A todo has no time yet, so it
		gets the fields it does have.
	-->
	<Modal
		open={editing !== null}
		error={form?.message}
		onclose={() => (editing = null)}
		title={editing?.title ?? ''}
		size="sm"
	>
		{#if editing}
			{@const card = editing}
			{#if card.goals.length}
				<div class="mb-3">
					<Backlinks goals={card.goals} />
				</div>
			{/if}

			<!--
				Which column it is in.

				Not part of the form below: moving a card is its own act and takes
				effect on the tap, where saving a name and a length is a form with a
				Save button. It is also the only way to reach Doing on a touch screen,
				where there is no drag.
			-->
			<div class="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
				<span class="eyebrow shrink-0 text-gray-600">Status</span>
				<div class="seg">
					{#each STATUSES as status (status)}
						<button
							type="button"
							aria-pressed={shownStatus(card) === status}
							onclick={() => {
								move(card, status);
								editing = null;
							}}
						>
							{STATUS_LABELS[status]}
						</button>
					{/each}
				</div>
			</div>

			<!--
				A nudge before it starts.

				Its own form, because setting a reminder and editing the block are two
				acts. A lead time rather than a clock reading, because "ten minutes
				before" is how anybody describes a reminder about something already on
				a calendar.
			-->
			{#if card.kind === 'instance' && card.startTime}
				{@const set = data.reminders[card.id] ?? []}
				<div class="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
					<span class="eyebrow shrink-0 text-gray-600">Remind me</span>
					{#each [5, 10, 30, 60] as minutes (minutes)}
						<form method="post" action="?/remind" use:enhance>
							<input type="hidden" name="id" value={card.id} />
							<input type="hidden" name="minutes" value={minutes} />
							<button class="btn btn-sm">
								{minutes < 60 ? `${minutes} min` : '1 hour'} before
							</button>
						</form>
					{/each}

					{#each set as reminder (reminder.id)}
						<form method="post" action="?/unremind" use:enhance class="flex items-center">
							<input type="hidden" name="reminderId" value={reminder.id} />
							<button
								class="chip flex items-center gap-1 text-gray-700"
								title="Remove this reminder"
								aria-label="Remove the reminder at {reminder.remindAt.slice(11, 16)}"
							>
								<Icon name="clock" size={12} />
								<span class="tabular">{reminder.remindAt.slice(11, 16)}</span>
								<Icon name="close" size={12} />
							</button>
						</form>
					{/each}
				</div>
			{/if}
			<form
				id="edit-form"
				method="post"
				action={card.kind === 'instance' ? '?/editInstance' : '?/setRatings'}
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') editing = null;
					}}
			>
				<input type="hidden" name="id" value={card.id} />
				<input type="hidden" name="kind" value={card.kind} />
				{#if card.kind === 'instance'}
					<!-- What it was before, so the server can tell a retime from a save
					     that only touched the name. -->
					<input type="hidden" name="slotId" value={card.slotId ?? ''} />
					<input type="hidden" name="date" value={card.scheduledDate ?? data.date} />
					<input type="hidden" name="wasStartTime" value={card.startTime ?? ''} />
					<input type="hidden" name="wasDuration" value={card.durationMinutes} />
				{/if}

				<FormGrid>
					{#if card.kind === 'instance'}
						<Field
							label="Called"
							span={12}
							hint="This occurrence only. Empty keeps the block's own name."
						>
							<OneLine
								name="label"
								placeholder={card.title}
								value={card.labelOverride ?? ''}
								class="input"
							/>
						</Field>

						<Field label="Starts" span={6}>
							<input
								autocomplete="off"
								name="startTime"
								type="time"
								value={card.startTime ?? ''}
								class="input tabular"
							/>
						</Field>

						<Field label="Minutes" span={6}>
							<input
								autocomplete="off"
								name="durationMinutes"
								type="number"
								min="5"
								max="1440"
								step="5"
								value={card.durationMinutes}
								class="input tabular"
							/>
						</Field>

						{#if card.mode === 'category'}
							<Field
								label="What it was"
								span={12}
								hint="This block names a category. Say which activity it turned out to be."
							>
								<select name="activityId" class="select">
									<option value="">— not said —</option>
									{#each data.activities as activity (activity.id)}
										<option value={activity.id} selected={card.activityId === activity.id}>
											{activity.categoryName} · {activity.name}
										</option>
									{/each}
								</select>
							</Field>
						{/if}
					{/if}

					<MoreOptions label="Urgency, interest, energy" count={editRatingsSet}>
						{#each RATINGS as r (r)}
							<div class="col-span-12">
								<RatingPicker rating={r} bind:value={editRatings[r]} />
							</div>
						{/each}
					</MoreOptions>
				</FormGrid>
			</form>
		{/if}

		{#snippet footer()}
			{#if editing}
				{@const card = editing}
				<form
					method="post"
					action={card.kind === 'instance' ? '?/deleteInstance' : '?/deleteTodo'}
					use:enhance={() =>
						async ({ update }) => {
							editing = null;
							await update();
						}}
					class="mr-auto"
				>
					<input type="hidden" name="id" value={card.id} />
					<input type="hidden" name="kind" value={card.kind} />
					<button class="btn btn-danger btn-sm" use:armed>
						<Icon name="trash" /> Delete
					</button>
				</form>
			{/if}
			<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
			<button type="submit" form="edit-form" class="btn btn-primary">Save</button>
		{/snippet}
	</Modal>

	{#if tab === 'today' && dayTotals.length > 0}
		<!-- Where the day goes. The one thing a column of cards cannot show. -->
		<div
			class="flex flex-wrap items-center gap-x-5 gap-y-2 border border-gray-200 bg-white px-4 py-2"
		>
			{#each dayTotals as total (total.name)}
				<span class="flex items-center gap-2 text-sm">
					<span class="h-3 w-1" style="background-color: {total.color}"></span>
					<span class="text-gray-700">{total.name}</span>
					<span class="tabular text-gray-500">{formatDuration(total.minutes)}</span>
				</span>
			{/each}
		</div>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row">
		<div class="min-w-0 flex-1">
			<!-- Which column the phone is looking at. Above md every column is on
			     screen at once and this is not drawn at all. -->
			<!--
				The switcher, which is also where you drop.

				With one column on the screen there is nowhere to drag a card *to* —
				the column it should go in is the one that is not visible. So the
				names above are the target: they light up the moment a drag starts,
				and dropping on one moves the card there and follows it, which is
				the only way the gesture makes sense when you cannot see where it
				landed.
			-->
			<div class="seg mb-3 flex w-full md:hidden {dragging ? 'ring-2 ring-gray-900' : ''}">
				{#each columns as column (column.status)}
					<button
						type="button"
						onclick={() => (phoneColumn = column.status)}
						aria-pressed={phoneColumn === column.status}
						ondragover={(e) => {
							e.preventDefault();
							dragOverColumn = column.status;
						}}
						ondragleave={() => {
							if (dragOverColumn === column.status) dragOverColumn = null;
						}}
						ondrop={async (e) => {
							const card = dragging;
							await onDropInColumn(column.status, e);
							// Follow it. A card that moved to a column you cannot see
							// has, as far as the screen is concerned, vanished.
							if (card) phoneColumn = column.status;
						}}
						class="flex-1 gap-1.5 {dragging && dragOverColumn === column.status
							? 'bg-gray-900 text-white'
							: ''}"
					>
						{STATUS_LABELS[column.status]}
						<span
							class="tabular text-xs {dragging && dragOverColumn === column.status
								? 'text-gray-300'
								: 'text-gray-500'}">{column.cards.length}</span
						>
					</button>
				{/each}
			</div>

			<div
				class="grid grid-cols-1 gap-3 md:auto-cols-fr md:grid-flow-col"
				data-tour="board-columns"
			>
				{#each columns as column, ci (column.status)}
					<section
						class="min-h-64 flex-col border bg-gray-50 {phoneColumn === column.status
							? 'flex'
							: 'hidden'} md:flex {dragOverColumn === column.status
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
						<!--
							The switcher above says both of these on a phone.

							It lights up while a card is being dragged, like the switcher
							does: a column is a drop target for its whole height, and the
							header is the part somebody aims at.
						-->
						<header
							class="hidden items-center justify-between border-b px-3 py-2 md:flex {dragging &&
							dragOverColumn === column.status
								? 'border-gray-900 bg-gray-900 text-white'
								: 'border-gray-200 bg-white'}"
						>
							<span
								class="eyebrow {dragging && dragOverColumn === column.status
									? 'text-white'
									: 'text-gray-600'}">{STATUS_LABELS[column.status]}</span
							>
							<span
								class="tabular text-xs {dragging && dragOverColumn === column.status
									? 'text-gray-300'
									: 'text-gray-500'}">{column.cards.length}</span
							>
						</header>

						<div class="flex-1 space-y-2 p-2">
							{#each column.cards as card, ri (card.uid)}
								<!-- Whether the second line has anything on it at all. -->
								{@const badges =
									needsResolution(card) ||
									(card.kind === 'todo' &&
										!!card.scheduledDate &&
										card.scheduledDate < data.date) ||
									card.goals.length > 0 ||
									card.ratings.urgency != null ||
									card.ratings.interest != null ||
									card.ratings.energy != null}
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
									class="cursor-grab border bg-white px-2 py-1.5 shadow-card {focusCol === ci &&
									focusRow === ri
										? 'ring-2 ring-gray-900 ring-inset'
										: ''} {dragging?.uid === card.uid ? 'opacity-40' : ''} border-gray-200"
								>
									<div class="flex items-start gap-2">
										<!--
											Done, with a thumb.

											Dragging is a mouse gesture: it does not exist on a touch
											screen, which left a phone with no way at all to move a card
											out of a column. This is the one move that matters, it is the
											same box as the todo list's, and it is held for the undo
											window rather than sent — so a mis-tap costs nothing.

											The box is 20px; the thing you tap is 44.
										-->
										<button
											type="button"
											onclick={(e) => {
												e.stopPropagation();
												move(card, shownStatus(card) === 'done' ? 'todo' : 'done');
											}}
											class="-m-1 flex shrink-0 items-center justify-center p-1 pointer-coarse:w-11"
											title={shownStatus(card) === 'done' ? 'Mark not done' : 'Mark done'}
											aria-label={shownStatus(card) === 'done'
												? `Mark ${card.title} not done`
												: `Mark ${card.title} done`}
										>
											<span
												class="flex h-4 w-4 items-center justify-center border border-gray-400 {shownStatus(
													card
												) === 'done'
													? 'bg-gray-400 text-white'
													: 'bg-white'}"
											>
												{#if shownStatus(card) === 'done'}
													<Icon name="check" size={11} />
												{/if}
											</span>
										</button>
										<span
											class="mt-1 h-3 w-1 shrink-0"
											style="background-color: {card.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
											title={card.categoryName ?? 'No category'}
										></span>
										<div class="min-w-0 flex-1">
											<!--
												The time belongs beside the title, not under it.
												This card used to spend four lines on a title, a gap, a
												time and a row of badges, so a column held five of them
												on a laptop. A card with nothing to say is one line now.
											-->
											<div class="flex items-baseline gap-1.5">
												{#if card.startTime}
													<span class="tabular shrink-0 font-mono text-[10px] text-gray-500">
														{card.startTime}
													</span>
												{/if}
												<p class="min-w-0 flex-1 truncate text-sm text-gray-900">{card.title}</p>
												<button
													type="button"
													onclick={(e) => {
														e.stopPropagation();
														openEditor(card);
													}}
													class="shrink-0 self-start text-gray-500 transition hover:text-gray-900"
													aria-label="Edit {card.title}"
												>
													<Icon name="edit" size={14} />
												</button>
											</div>
											{#if badges}
												<div class="mt-0.5 flex flex-wrap items-center gap-2">
													{#if needsResolution(card)}
														<button
															type="button"
															onclick={(e) => {
																e.stopPropagation();
																openEditor(card);
															}}
															class="border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700"
														>
															which activity?
														</button>
													{/if}
													{#if card.kind === 'todo' && card.scheduledDate && card.scheduledDate < data.date}
														<span class="text-[10px] text-gray-500">carried over</span>
													{/if}
													<RatingBadges values={card.ratings} />
													<!--
													Why this card exists, in one glyph. A kanban card is
													scanned rather than read, so the goal's name would cost
													more room than it is worth here — the editor spells it
													out, and so does the todo list.
												-->
													{#if card.goals.length}
														<span
															class="text-gray-500"
															title={card.goals.map((g) => g.title).join(' · ')}
														>
															<Icon name="goals" size={11} />
														</span>
													{/if}
												</div>
											{/if}
										</div>
									</div>

									<!--
										What `x` arms. The key does not delete on its own — a keystroke
										that destroys a row is one you make by accident — it opens this,
										and the button ignores its own first moments, so the press that
										armed it cannot also confirm it. Escape backs out, as everywhere
										else here.
									-->
									{#if confirmingDelete === card.uid}
										<form
											method="post"
											action="?/deleteTodo"
											use:enhance={() =>
												async ({ update }) => {
													confirmingDelete = null;
													await update();
												}}
											class="mt-1.5 flex items-center gap-2 border-t border-gray-200 pt-1.5"
										>
											<input type="hidden" name="id" value={card.id} />
											<input type="hidden" name="kind" value={card.kind} />
											<span class="text-[11px] text-gray-600">Delete this?</span>
											<button
												class="btn btn-danger btn-sm ml-auto"
												use:armed
												use:focusHere
												onclick={(e) => e.stopPropagation()}
											>
												Delete
											</button>
											<button
												type="button"
												class="btn btn-sm"
												onclick={(e) => {
													e.stopPropagation();
													confirmingDelete = null;
												}}
											>
												Cancel
											</button>
										</form>
									{/if}
								</article>
							{/each}

							{#if column.cards.length === 0}
								<p class="px-1 py-4 text-center text-xs text-gray-500">
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
				aria-label="To-do list"
				class="w-full shrink-0 border bg-gray-50 md:w-64 lg:w-72 xl:w-80 {railOver
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
					<!-- Todo, like the tab and the plan's rail. The status column beside
					     it is "Pending", which is what stops the two reading as one word. -->
					<span class="eyebrow text-gray-600">To-do</span>
					<span class="tabular text-xs text-gray-500">{railCards.length}</span>
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
						<p class="px-1 py-6 text-center text-xs text-gray-500">
							{railOver ? 'Drop to send back' : 'Nothing waiting'}
						</p>
					{/if}
				</div>
			</aside>
		{/if}
	</div>

	<p class="kbd-hint text-xs text-gray-500">
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'prev-column')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'next-card')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'prev-card')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'next-column')}</kbd
		>
		move ·
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'carry-left')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'carry-right')}</kbd
		>
		carry card ·
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'toggle-done')}</kbd
		>
		done ·
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'toggle-today')}</kbd
		>
		today ·
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'switch-tab')}</kbd
		>
		switch tab ·
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">1-5</kbd> rate ·
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'delete')}</kbd
		> delete
	</p>
</div>
