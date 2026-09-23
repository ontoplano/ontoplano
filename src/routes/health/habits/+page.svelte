<script lang="ts">
	import { enhance } from '$lib/enhance';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { tick } from 'svelte';
	import type { PageData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';
	import HabitCard from '$lib/components/HabitCard.svelte';
	import { HABIT_ROOM_ACTIONS } from '$lib/habit-action-names';
	import HabitFields from '$lib/components/fields/HabitFields.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	interface Habit {
		id: number;
		name: string;
		description: string | null;
		type: 'bad' | 'good' | 'neutral';
		scheduledDays: string | null;
		createdAt: string;
		streak: number;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedHabitIndex = $state(0);
	let expandedHabitId: number | null = $state(null);
	let typeFilter: 'all' | 'bad' | 'good' | 'neutral' = $state('all');

	let newHabitType: 'bad' | 'good' | 'neutral' = $state('bad');
	let scheduledDaysState: boolean[] = $state([false, false, false, false, false, false, false]);

	function filteredHabits() {
		if (typeFilter === 'all') return data.habits as Habit[];
		return (data.habits as Habit[]).filter((h: Habit) => h.type === typeFilter);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (showForm) {
				showForm = false;
				resetForm();
			} else {
				expandedHabitId = null;
			}
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const habits = filteredHabits();
		const action = getAction('/health/habits', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				selectedHabitIndex = Math.min(selectedHabitIndex + 1, habits.length - 1);
				break;
			case 'navigate-up':
				selectedHabitIndex = Math.max(selectedHabitIndex - 1, 0);
				break;
			case 'new':
				editingId = null;
				showForm = true;
				resetForm();
				tick().then(() => {
					const nameInput = document.querySelector<HTMLInputElement>('input[name="label"]');
					nameInput?.focus();
				});
				break;
			case 'toggle-expand':
				if (habits.length > 0) {
					const habit = habits[selectedHabitIndex];
					expandedHabitId = expandedHabitId === habit.id ? null : habit.id;
				}
				break;
		}
	}

	function openNewHabit() {
		editingId = null;
		resetForm();
		showForm = true;
	}

	function resetForm() {
		editingId = null;
		newHabitType = 'bad';
		scheduledDaysState = [false, false, false, false, false, false, false];
	}

	function startEdit(habit: Habit) {
		editingId = habit.id;
		newHabitType = habit.type;
		const scheduled = habit.scheduledDays
			? habit.scheduledDays
					.split(',')
					.map((s) => parseInt(s.trim(), 10))
					.filter((n) => !isNaN(n) && n >= 0 && n <= 6)
			: [];
		scheduledDaysState = [0, 1, 2, 3, 4, 5, 6].map((d) => scheduled.includes(d));
		showForm = true;
		tick().then(() => {
			const nameInput = document.querySelector<HTMLInputElement>('input[name="label"]');
			nameInput?.focus();
		});
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('health.habits.newHabit'),
		open: showForm,
		tour: 'habit-new',
		run: () => {
			if (showForm && !editingId) {
				showForm = false;
				resetForm();
				return;
			}
			editingId = null;
			showForm = !showForm;
			if (!showForm) {
				resetForm();
				return;
			}
			tick().then(() => {
				const nameInput = document.querySelector<HTMLInputElement>('input[name="label"]');
				nameInput?.focus();
			});
		}
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<RoomToolbar>
		{#snippet filters()}
			<FilterChips
				label={t('health.habits.kind')}
				bind:value={typeFilter}
				onchange={() => (selectedHabitIndex = 0)}
				options={[
					{ value: 'all', label: 'app.all' },
					{ value: 'good', label: 'app.good' },
					{ value: 'bad', label: 'app.bad' },
					{ value: 'neutral', label: 'app.neutral' }
				]}
			/>
		{/snippet}
	</RoomToolbar>

	<FormError message={form?.message} />

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? t('health.habits.editHabit') : t('health.habits.newHabit')}
		onclose={resetForm}
		size="sm"
	>
		{@const editHabit = editingId ? (data.habits as Habit[]).find((h) => h.id === editingId) : null}
		<form
			id="habit-form"
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						showForm = false;
						resetForm();
					}
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}
			<HabitFields editing={editHabit} bind:kind={newHabitType} bind:days={scheduledDaysState} />
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
			<button type="submit" form="habit-form" class="btn btn-primary">
				{editingId ? t('ui.save') : t('health.habits.createHabit')}
			</button>
		{/snippet}
	</Modal>

	{#if filteredHabits().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if typeFilter === 'all'}
				<EmptyState
					icon="health"
					title={t('health.habits.nothingTrackedYet')}
					description={t('health.habits.aHabitIsSomethingYou')}
				>
					{#snippet action()}
						<button onclick={openNewHabit} class="btn btn-primary">
							<Icon name="plus" />
							{t('health.habits.newHabit')}
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<EmptyState icon="health" title={t('health.habits.nothingTrackedInThisFilter')}>
					{#snippet action()}
						<button onclick={() => (typeFilter = 'all')} class="btn"
							>{t('health.habits.showAllHabits')}</button
						>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{:else}
		<!--
			One surface, and a habit is a row on it.

			The coloured edge down the left is what tells one habit from another —
			it does not need a card each and a strip of page between them to do
			that, and a screen of separate boxes read as a scatter rather than as
			the list it is.
		-->
		<div
			class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card"
			data-tour="habit-list"
		>
			{#each filteredHabits() as habit, i (habit.id)}
				<!--
					The card is a component, so a habit filed under a notebook is the
					same habit this room shows — its streak, its year at a glance, its
					backdating and the notes on each day. See `HabitCard`.
				-->
				<div
					use:keepInView={i === selectedHabitIndex}
					class={i === selectedHabitIndex ? 'kbd-cursor' : ''}
				>
					<HabitCard
						{habit}
						occurrences={data.occurrences}
						today={data.today}
						firstDay={data.config.week.firstDay}
						actions={HABIT_ROOM_ACTIONS}
						onedit={() => startEdit(habit)}
						expanded={expandedHabitId === habit.id}
						onexpand={(id) => (expandedHabitId = expandedHabitId === id ? null : id)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>
