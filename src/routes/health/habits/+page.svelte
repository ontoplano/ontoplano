<script lang="ts">
	import { routeGlyph } from '$lib/glyphs';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import { enhance } from '$lib/enhance';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
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

	let looking = $state('');

	const KINDS = [
		{ value: 'all', label: 'health.habits.everyKind' },
		{ value: 'good', label: 'app.good' },
		{ value: 'bad', label: 'app.bad' },
		{ value: 'neutral', label: 'app.neutral' }
	] as const;

	const narrowed = $derived(typeFilter !== 'all' || looking.trim() !== '');

	function filteredHabits() {
		const needle = looking.trim().toLowerCase();
		return (data.habits as Habit[]).filter(
			(h) =>
				(typeFilter === 'all' || h.type === typeFilter) &&
				(needle === '' ||
					h.name.toLowerCase().includes(needle) ||
					(h.description ?? '').toLowerCase().includes(needle))
		);
	}

	function clearFilters() {
		typeFilter = 'all';
		looking = '';
		selectedHabitIndex = 0;
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
	<FormError message={form?.message} />

	<!--
		The controls and the habits are one object — see `RoomSurface` — with
		the same strip the task list has along its top: search, how many are
		showing, and the kind as a `Picker`.
	-->
	<RoomSurface dataTour="habit-list">
		{#snippet tools()}
			<FilterBar
				name="habits"
				on={narrowed}
				summary={typeFilter === 'all' ? '' : t(KINDS.find((k) => k.value === typeFilter)!.label)}
				onclear={clearFilters}
			>
				{#snippet lead()}
					<SearchField
						bind:value={looking}
						oninput={() => (selectedHabitIndex = 0)}
						label={t('health.habits.search')}
					/>
				{/snippet}
				{#snippet count()}
					<!-- Held open by the count of every habit, so narrowing does not
					     change its width. See `.count-slot`. -->
					<ShowingCount
						total={data.habits.length}
						shown={filteredHabits().length}
						said={(count) => t('health.habits.showingCount', { count })}
					/>
				{/snippet}
				<Picker
					value={typeFilter}
					options={KINDS.map((k) => ({ value: k.value, label: t(k.label) }))}
					onpick={(next) => {
						typeFilter = next;
						selectedHabitIndex = 0;
					}}
					label={t('health.habits.kind')}
					class="min-w-32 flex-1 sm:flex-none"
				/>
			</FilterBar>
		{/snippet}

		{#if filteredHabits().length === 0}
			<!-- Inside the surface, so the controls that emptied it stay to undo it. -->
			{#if !narrowed}
				<EmptyState
					icon={routeGlyph('/health/habits')!}
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
				<EmptyState icon="search" title={t('health.habits.nothingTrackedInThisFilter')}>
					{#snippet action()}
						<button onclick={clearFilters} class="btn">{t('health.habits.showAllHabits')}</button>
					{/snippet}
				</EmptyState>
			{/if}
		{:else}
			<!--
				A habit is a row on the surface. The coloured edge down the left is
				what tells one kind from another; the rows need no card each.
			-->
			<div class="divide-y divide-gray-200">
				{#each filteredHabits() as habit, i (habit.id)}
					<!--
						The card is a component, so a habit filed under a notebook is the
						same habit this room shows. See `HabitCard`.
					-->
					<div
						use:keepInView={i === selectedHabitIndex}
						class={i === selectedHabitIndex ? 'kb-cursor' : ''}
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
	</RoomSurface>
</div>

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
		<HabitFields
			editing={editHabit}
			bind:kind={newHabitType}
			bind:days={scheduledDaysState}
			notebooks={data.notebooks}
		/>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="habit-form" class="btn btn-primary">
			{editingId ? t('ui.save') : t('health.habits.createHabit')}
		</button>
	{/snippet}
</Modal>
