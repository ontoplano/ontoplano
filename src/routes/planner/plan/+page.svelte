<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types.js';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { autofocus } from '$lib/actions/autofocus.js';
	import MetaEditor from '$lib/components/MetaEditor.svelte';
	import { parseSlotMeta } from '$lib/meta-keys.js';
	import { getAction } from '$lib/shortcuts';
	import { Calendar, TimeGrid, Interaction } from '@event-calendar/core';
	import '@event-calendar/core/index.css';
	import {
		baseGridOptions,
		buildSlotEvents,
		buildExceptionalEvents,
		placementFromDates,
		decodeEventId,
		weekdayToDate,
		formatLocalDate,
		describeGridEvent,
		GRID_ZOOM_LEVELS,
		GRID_DEFAULT_ZOOM_INDEX,
		type GridEventDetail
	} from '$lib/planner-grid.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let viewMode: 'list' | 'grid' = $state(data.view === 'grid' ? 'grid' : 'list');
	let prefillTime = $state('09:00');
	let prefillDuration = $state(60);
	let gridError: string | null = $state(null);
	let createFormEl: HTMLFormElement | undefined = $state();
	let ec: { addEvent: (e: unknown) => unknown } | undefined = $state();

	const ZOOM_STORAGE_KEY = 'ontoplano:planner-grid-zoom';

	function storedZoomIndex(): number {
		if (!browser) return GRID_DEFAULT_ZOOM_INDEX;
		const stored = localStorage.getItem(ZOOM_STORAGE_KEY);
		if (stored === null) return GRID_DEFAULT_ZOOM_INDEX;
		const raw = Number(stored);
		if (!Number.isInteger(raw) || raw < 0 || raw >= GRID_ZOOM_LEVELS.length) {
			return GRID_DEFAULT_ZOOM_INDEX;
		}
		return raw;
	}

	let zoomIndex = $state(storedZoomIndex());
	let hovered: (GridEventDetail & { top: number; left: number; flip: boolean }) | null =
		$state(null);

	const slotHeight = $derived(GRID_ZOOM_LEVELS[zoomIndex]);

	function setZoom(index: number) {
		const next = Math.min(Math.max(index, 0), GRID_ZOOM_LEVELS.length - 1);
		if (next === zoomIndex) return;
		zoomIndex = next;
		hovered = null;
		if (browser) localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
	}

	// Ctrl/Cmd+wheel over the grid zooms the grid instead of the whole page. The listener
	// must be non-passive for preventDefault() to take effect, hence the manual binding.
	function gridZoomWheel(node: HTMLElement) {
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			setZoom(zoomIndex + (e.deltaY < 0 ? 1 : -1));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return {
			destroy() {
				node.removeEventListener('wheel', onWheel);
			}
		};
	}

	function showHover(info: { el: HTMLElement; event: Parameters<typeof describeGridEvent>[0] }) {
		const rect = info.el.getBoundingClientRect();
		const flip = rect.right + 260 > window.innerWidth;
		hovered = {
			...describeGridEvent(info.event),
			top: rect.top,
			left: flip ? rect.left : rect.right,
			flip
		};
	}

	$effect(() => {
		viewMode = data.view === 'grid' ? 'grid' : 'list';
	});

	// Sentinel value for the "+ New activity" option in the activity selects; the
	// server creates the activity as part of the same submission.
	const NEW_ACTIVITY = '__new__';

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let slotMode: 'category' | 'activity' = $state('activity');
	let activityChoice = $state(NEW_ACTIVITY);
	let exceptionalActivityChoice = $state(NEW_ACTIVITY);
	// Offset into the visible window (0 = the day it starts on, i.e. today by
	// default), not a Monday-indexed weekday. The weekday is derived from it.
	let selectedOffset: number = $state(0);
	let selectedIndex: number = $state(0);
	let showExceptionalForm = $state(false);
	let exceptionalMode: 'category' | 'activity' = $state('activity');

	const selectedDayInfo = $derived(data.range.days[selectedOffset] ?? data.range.days[0]);
	const selectedWeekday = $derived(selectedDayInfo.weekday);

	let selectedIds: Set<number> = $state(new Set());
	let multiselect = $state(false);
	let showCopyPanel = $state(false);
	let copyTargetDays: Set<number> = $state(new Set());
	let confirmingDelete: string | null = $state(null);
	let confirmingBulkDelete = $state(false);
	let schemesExpanded = $state(false);
	let newSchemeName = $state('');
	let confirmingLoadSchemeId: number | null = $state(null);
	let confirmingDeleteSchemeId: number | null = $state(null);
	let confirmingClearAll = $state(false);
	let showCsvImport = $state(false);

	let timeInput: HTMLInputElement | undefined = $state(undefined);

	type Slot = (typeof data.slots)[number];

	function selectedDateStr(): string {
		return selectedDayInfo.date;
	}

	function selectOffsetForDate(date: string) {
		const offset = data.range.days.findIndex((d: { date: string }) => d.date === date);
		if (offset >= 0) selectedOffset = offset;
	}

	function isSlotSuppressed(slotId: number): boolean {
		const date = selectedDateStr();
		return data.suppressions.some(
			(s: { slotId: number; date: string }) => s.slotId === slotId && s.date === date
		);
	}

	function exceptionalSlotsForDay() {
		const date = selectedDateStr();
		return data.exceptionals.filter((e: { date: string }) => e.date === date);
	}

	function catColor(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_COLOR;
		const cat = data.categories?.find((c: { id: number }) => c.id === catId);
		return cat?.color ?? CATEGORY_FALLBACK_COLOR;
	}

	function slotsForDay(day: number): Slot[] {
		return data.slots.filter((s: Slot) => s.weekday === day);
	}

	function slotLabel(slot: (typeof data.slots)[number]): string {
		if (slot.mode === 'activity' && slot.activityName) return slot.activityName;
		if (slot.label) return slot.label;
		if (slot.categoryName) return slot.categoryName;
		return 'Slot';
	}

	function computeEndTime(startTime: string, durationMinutes: number): string {
		const [h, m] = startTime.split(':').map(Number);
		const total = h * 60 + m + durationMinutes;
		const eh = Math.floor(total / 60) % 24;
		const em = total % 60;
		return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
	}

	function formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}min`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}min`;
	}

	function formatWeekDate(dateStr: string): string {
		const d = new Date(`${dateStr}T00:00:00`);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function defaultActivityChoice(activityId: number | null | undefined): string {
		if (activityId != null) return String(activityId);
		if (data.activities.length > 0) return String(data.activities[0].id);
		return NEW_ACTIVITY;
	}

	function startEdit(slot: (typeof data.slots)[number]) {
		editingId = slot.id;
		slotMode = slot.mode as 'category' | 'activity';
		activityChoice = defaultActivityChoice(slot.activityId);
		showForm = true;
		showExceptionalForm = false;
		tick().then(() => timeInput?.focus());
	}

	function startNew() {
		showForm = true;
		showExceptionalForm = false;
		editingId = null;
		activityChoice = defaultActivityChoice(null);
		tick().then(() => timeInput?.focus());
	}

	function startNewExceptional() {
		showExceptionalForm = true;
		showForm = false;
		editingId = null;
		exceptionalMode = 'activity';
		exceptionalActivityChoice = defaultActivityChoice(null);
	}

	function goToRange(from: string | null) {
		const parts: string[] = [];
		if (from) parts.push(`from=${from}`);
		if (viewMode === 'list') parts.push('view=list');
		goto(`/planner/plan${parts.length ? `?${parts.join('&')}` : ''}`);
	}

	function goToPrevWeek() {
		if (data.range.prev) goToRange(data.range.prev);
	}

	function goToNextWeek() {
		goToRange(data.range.next);
	}

	function goToToday() {
		goToRange(null);
	}

	function toggleSlotSelection(id: number) {
		if (selectedIds.has(id)) {
			selectedIds = new Set([...selectedIds].filter((x) => x !== id));
		} else {
			selectedIds = new Set([...selectedIds, id]);
		}
	}

	function exceptionalLabel(e: (typeof data.exceptionals)[number]): string {
		if (e.mode === 'activity' && e.activityName) return e.activityName;
		if (e.label) return e.label;
		if (e.categoryName) return e.categoryName;
		return 'Slot';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			showCopyPanel = false;
			confirmingDelete = null;
			confirmingBulkDelete = false;
			multiselect = false;
			selectedIds = new Set();
			showForm = false;
			showExceptionalForm = false;
			editingId = null;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const action = getAction('/planner/plan', e.key);
		if (!action) {
			if (showCopyPanel) {
				return;
			}
			return;
		}
		e.preventDefault();

		if (action === 'toggle-view') {
			setView(viewMode === 'grid' ? 'list' : 'grid');
			return;
		}

		if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
			if (viewMode !== 'grid') return;
			if (action === 'zoom-reset') setZoom(GRID_DEFAULT_ZOOM_INDEX);
			else setZoom(zoomIndex + (action === 'zoom-in' ? 1 : -1));
			return;
		}

		if (showCopyPanel) {
			return;
		}

		const slots = slotsForDay(selectedWeekday);

		if (multiselect) {
			switch (action) {
				case 'toggle-multiselect':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					multiselect = false;
					selectedIds = new Set();
					return;
				case 'toggle-select':
					if (slots.length > 0 && slots[selectedIndex]) {
						toggleSlotSelection(slots[selectedIndex].id);
					}
					return;
				case 'delete-selected':
					if (selectedIds.size > 0) {
						if (confirmingBulkDelete) {
							const form = document.getElementById('bulk-delete-form');
							if (form instanceof HTMLFormElement) form.requestSubmit();
							confirmingBulkDelete = false;
						} else {
							confirmingBulkDelete = true;
						}
					}
					return;
				case 'copy-to-days':
					if (selectedIds.size > 0) {
						showCopyPanel = true;
						copyTargetDays = new Set();
					}
					return;
				case 'prev-day':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					selectedOffset = Math.max(selectedOffset - 1, 0);
					selectedIndex = 0;
					return;
				case 'next-day':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					selectedOffset = Math.min(selectedOffset + 1, data.range.days.length - 1);
					selectedIndex = 0;
					return;
				case 'navigate-down':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					if (slots.length > 0) {
						selectedIndex = Math.min(selectedIndex + 1, slots.length - 1);
					}
					return;
				case 'navigate-up':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					if (slots.length > 0) {
						selectedIndex = Math.max(selectedIndex - 1, 0);
					}
					return;
			}
			return;
		}

		switch (action) {
			case 'prev-week':
				goToPrevWeek();
				break;
			case 'next-week':
				goToNextWeek();
				break;
			case 'toggle-multiselect':
				multiselect = true;
				break;
			case 'prev-day':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				selectedOffset = Math.max(selectedOffset - 1, 0);
				selectedIndex = 0;
				break;
			case 'next-day':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				selectedOffset = Math.min(selectedOffset + 1, data.range.days.length - 1);
				selectedIndex = 0;
				break;
			case 'navigate-down':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				if (slots.length > 0) {
					selectedIndex = Math.min(selectedIndex + 1, slots.length - 1);
				}
				break;
			case 'navigate-up':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				if (slots.length > 0) {
					selectedIndex = Math.max(selectedIndex - 1, 0);
				}
				break;
			case 'edit':
				if (slots.length > 0 && slots[selectedIndex]) {
					startEdit(slots[selectedIndex]);
				}
				break;
			case 'toggle-active':
				if (slots.length > 0 && slots[selectedIndex]) {
					const form = document.getElementById(`toggle-form-${slots[selectedIndex].id}`);
					if (form instanceof HTMLFormElement) form.requestSubmit();
				}
				break;
			case 'delete':
				if (slots.length > 0 && slots[selectedIndex]) {
					const slot = slots[selectedIndex];
					const key = `slot-${slot.id}`;
					if (confirmingDelete === key) {
						const form = document.getElementById(`delete-form-${slot.id}`);
						if (form instanceof HTMLFormElement) form.requestSubmit();
						confirmingDelete = null;
					} else {
						confirmingDelete = key;
					}
				}
				break;
			case 'new':
				startNew();
				break;
			case 'new-exceptional':
				startNewExceptional();
				break;
		}
	}

	function editingSlot(): Slot | null {
		return editingId ? (data.slots.find((s: Slot) => s.id === editingId) ?? null) : null;
	}

	function setView(mode: 'list' | 'grid') {
		viewMode = mode;
		const parts: string[] = [];
		if (mode === 'list') parts.push('view=list');
		if (!data.range.isCurrent) parts.push(`from=${data.range.from}`);
		const qs = parts.join('&');
		goto(`/planner/plan${qs ? `?${qs}` : ''}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	const suppressedSlotIds = $derived(
		new Set<number>(
			data.suppressions
				.filter((sup: { slotId: number; date: string }) => {
					const slot = data.slots.find((s: Slot) => s.id === sup.slotId);
					if (!slot) return false;
					return formatLocalDate(weekdayToDate(data.range.from, slot.weekday)) === sup.date;
				})
				.map((sup: { slotId: number }) => sup.slotId)
		)
	);

	const gridEvents = $derived([
		...buildSlotEvents(data.slots, data.range.from, data.categories, { suppressedSlotIds }),
		...buildExceptionalEvents(data.exceptionals, data.categories)
	]);

	const gridOptions = $derived({
		...baseGridOptions(data.range.from, { slotHeight }),
		events: gridEvents,
		editable: true,
		selectable: true,
		eventClick: handleEventClick,
		eventDrop: handleEventDrop,
		eventResize: handleEventPersist,
		select: handleGridSelect,
		eventMouseEnter: showHover,
		eventMouseLeave: () => (hovered = null),
		eventDragStart: () => (hovered = null),
		eventResizeStart: () => (hovered = null)
	});

	function handleEventClick(info: { event: { id: string | number } }) {
		const decoded = decodeEventId(info.event.id);
		if (!decoded || decoded.kind !== 'slot') return;
		const slot = data.slots.find((s: Slot) => s.id === decoded.refId);
		if (slot) startEdit(slot);
	}

	function handleGridSelect(info: { start: Date; end: Date }) {
		const placement = placementFromDates(info.start, info.end);
		selectOffsetForDate(formatLocalDate(info.start));
		prefillTime = placement.startTime;
		prefillDuration = placement.durationMinutes;
		startNew();
		tick().then(() => createFormEl?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
	}

	async function handleEventDrop(info: {
		event: { id: string | number; start: Date; end: Date };
		revert: () => void;
		jsEvent?: { ctrlKey?: boolean; metaKey?: boolean };
	}) {
		if (info.jsEvent?.ctrlKey || info.jsEvent?.metaKey) {
			await duplicateSlot(info);
			return;
		}
		await handleEventPersist(info);
	}

	async function duplicateSlot(info: {
		event: { id: string | number; start: Date; end: Date };
		revert: () => void;
	}) {
		const decoded = decodeEventId(info.event.id);
		const source =
			decoded && decoded.kind === 'slot'
				? data.slots.find((s: Slot) => s.id === decoded.refId)
				: null;
		const placement = placementFromDates(info.event.start, info.event.end);
		info.revert();

		if (!source) return;

		const body = new FormData();
		body.set('weekday', String(placement.weekday));
		body.set('startTime', placement.startTime);
		body.set('durationMinutes', String(placement.durationMinutes));
		body.set('mode', source.mode);
		if (source.categoryId != null) body.set('categoryId', String(source.categoryId));
		if (source.activityId != null) body.set('activityId', String(source.activityId));
		body.set('label', source.label ?? '');

		try {
			const res = await fetch(`${location.pathname}?/create`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const result = deserialize(await res.text());
			if (result.type === 'failure' || result.type === 'error') {
				gridError =
					(result.type === 'failure' && (result.data?.message as string)) ||
					'Failed to duplicate slot.';
				return;
			}
			gridError = null;
			const newId = result.type === 'success' ? (result.data?.id as number | undefined) : undefined;
			if (newId != null) {
				const newSlot: Slot = {
					...source,
					id: newId,
					weekday: placement.weekday,
					startTime: placement.startTime,
					durationMinutes: placement.durationMinutes
				};
				const [event] = buildSlotEvents([newSlot], data.range.from, data.categories, {
					suppressedSlotIds
				});
				ec?.addEvent(event);
				data.slots.push(newSlot);
			}
		} catch {
			gridError = 'Failed to duplicate slot.';
		}
	}

	async function handleEventPersist(info: {
		event: { id: string | number; start: Date; end: Date };
		revert: () => void;
	}) {
		const decoded = decodeEventId(info.event.id);
		if (!decoded || decoded.kind !== 'slot') {
			info.revert();
			return;
		}
		const slot = data.slots.find((s: Slot) => s.id === decoded.refId);
		if (!slot) {
			info.revert();
			return;
		}
		const placement = placementFromDates(info.event.start, info.event.end);
		const body = new FormData();
		body.set('id', String(slot.id));
		body.set('weekday', String(placement.weekday));
		body.set('startTime', placement.startTime);
		body.set('durationMinutes', String(placement.durationMinutes));
		body.set('mode', slot.mode);
		if (slot.categoryId != null) body.set('categoryId', String(slot.categoryId));
		if (slot.activityId != null) body.set('activityId', String(slot.activityId));
		body.set('label', slot.label ?? '');

		try {
			const res = await fetch(`${location.pathname}?/update`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const result = deserialize(await res.text());
			if (result.type === 'failure' || result.type === 'error') {
				info.revert();
				gridError =
					(result.type === 'failure' && (result.data?.message as string)) || 'Failed to move slot.';
				return;
			}
			gridError = null;
			slot.weekday = placement.weekday;
			slot.startTime = placement.startTime;
			slot.durationMinutes = placement.durationMinutes;
		} catch {
			info.revert();
			gridError = 'Failed to move slot.';
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<button
				onclick={goToPrevWeek}
				disabled={!data.range.prev}
				class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
				title={data.range.prev ? 'Back 7 days ([)' : 'Already starting today'}>&larr;</button
			>
			<button
				onclick={goToToday}
				disabled={data.range.isCurrent}
				class="border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed"
				class:border-gray-900={data.range.isCurrent}
				class:text-gray-900={data.range.isCurrent}
			>
				Today
			</button>
			<button
				onclick={goToNextWeek}
				class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
				title="Forward 7 days (])">&rarr;</button
			>
		</div>
		<div class="flex gap-2">
			<div class="flex">
				<button
					onclick={() => setView('list')}
					class="px-3 py-1 text-sm {viewMode === 'list'
						? 'bg-gray-900 font-medium text-white hover:bg-gray-800'
						: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50'}"
					title="List view (g)">List</button
				>
				<button
					onclick={() => setView('grid')}
					class="px-3 py-1 text-sm {viewMode === 'grid'
						? 'bg-gray-900 font-medium text-white hover:bg-gray-800'
						: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50'}"
					title="Grid view (g)">Grid</button
				>
			</div>
			<button
				onclick={() => {
					if (showExceptionalForm) {
						showExceptionalForm = false;
					} else {
						startNewExceptional();
					}
				}}
				class="border border-blue-200 bg-white px-3 py-1 text-sm text-blue-600 shadow-sm transition hover:bg-blue-50"
			>
				{showExceptionalForm ? 'Cancel' : '+ Exception'}
			</button>
			<button
				onclick={() => {
					if (showForm) {
						showForm = false;
						editingId = null;
					} else {
						startNew();
					}
				}}
				class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
			>
				{showForm ? 'Cancel' : 'New Slot'}
			</button>
		</div>
	</div>

	<div class="text-center text-sm text-gray-500">
		{formatWeekDate(data.range.from)} &mdash; {formatWeekDate(data.range.last)}
		{#if data.range.isCurrent}
			<span class="text-gray-400">· next 7 days</span>
		{/if}
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if gridError}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{gridError}
		</div>
	{/if}

	<div class="border border-gray-200 bg-white shadow-sm">
		<button
			type="button"
			onclick={() => {
				schemesExpanded = !schemesExpanded;
				if (!schemesExpanded) {
					confirmingLoadSchemeId = null;
					confirmingDeleteSchemeId = null;
					confirmingClearAll = false;
				}
			}}
			class="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
		>
			<span>Schemes</span>
			<span class="text-xs text-gray-500">{schemesExpanded ? 'Hide' : 'Show'}</span>
		</button>

		{#if schemesExpanded}
			<div class="space-y-4 border-t border-gray-200 px-4 py-4">
				<form
					method="post"
					action="?/saveScheme"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							if (result.type === 'success') {
								newSchemeName = '';
							}
						};
					}}
					class="space-y-2"
				>
					<div class="text-sm font-medium text-gray-900">Save current plan as scheme</div>
					<div class="flex gap-2">
						<input
							name="name"
							type="text"
							autocomplete="off"
							bind:value={newSchemeName}
							placeholder="Scheme name"
							required
							use:autofocus
							class="flex-1 border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<button
							type="submit"
							class="bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
						>
							Save
						</button>
					</div>
				</form>

				<div class="border border-gray-200 bg-white shadow-sm">
					<div
						class="border-b border-gray-200 px-4 py-2 text-xs font-medium tracking-wide text-gray-500 uppercase"
					>
						Saved schemes
					</div>
					{#if data.schemes.length === 0}
						<div class="px-4 py-6 text-sm text-gray-500">No schemes saved yet.</div>
					{:else}
						<div class="divide-y divide-gray-200">
							{#each data.schemes as scheme (scheme.id)}
								<div class="flex items-center gap-4 px-4 py-3">
									<form method="post" action="?/renameScheme" use:enhance class="min-w-0 flex-1">
										<input type="hidden" name="schemeId" value={scheme.id} />
										<div class="flex gap-2">
											<input
												name="name"
												type="text"
												autocomplete="off"
												value={scheme.name}
												required
												class="w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<button
												type="submit"
												class="border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
											>
												Rename
											</button>
										</div>
									</form>
									<div class="flex shrink-0 items-center gap-2">
										<form
											method="post"
											action="?/loadScheme"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													confirmingLoadSchemeId = null;
												};
											}}
										>
											<input type="hidden" name="schemeId" value={scheme.id} />
											{#if confirmingLoadSchemeId === scheme.id}
												<button
													type="submit"
													class="border border-blue-200 bg-white px-3 py-2 text-sm text-blue-600 shadow-sm transition hover:bg-blue-50"
												>
													This will replace your current plan. Continue?
												</button>
											{:else}
												<button
													type="button"
													onclick={() => {
														confirmingLoadSchemeId = scheme.id;
														confirmingDeleteSchemeId = null;
														confirmingClearAll = false;
													}}
													class="border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
												>
													Load
												</button>
											{/if}
										</form>

										{#if confirmingDeleteSchemeId === scheme.id}
											<div class="flex items-center gap-2">
												<form
													method="post"
													action="?/deleteScheme"
													use:enhance={() => {
														return async ({ update }) => {
															await update();
															confirmingDeleteSchemeId = null;
														};
													}}
												>
													<input type="hidden" name="schemeId" value={scheme.id} />
													<button
														type="submit"
														class="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100"
													>
														Confirm?
													</button>
												</form>
												<button
													type="button"
													onclick={() => (confirmingDeleteSchemeId = null)}
													class="border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
												>
													Cancel
												</button>
											</div>
										{:else}
											<button
												type="button"
												onclick={() => {
													confirmingDeleteSchemeId = scheme.id;
													confirmingLoadSchemeId = null;
													confirmingClearAll = false;
												}}
												class="border border-red-200 bg-white px-3 py-2 text-sm text-red-600 shadow-sm transition hover:bg-red-50"
											>
												Delete
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="border-t border-gray-200 pt-4">
					{#if confirmingClearAll}
						<div class="flex items-center gap-3">
							<span class="text-sm text-red-600">Delete all slots?</span>
							<form
								method="post"
								action="?/clearAll"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										confirmingClearAll = false;
									};
								}}
							>
								<button
									type="submit"
									class="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100"
								>
									Yes, clear all
								</button>
							</form>
							<button
								type="button"
								onclick={() => (confirmingClearAll = false)}
								class="border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
							>
								Cancel
							</button>
						</div>
					{:else}
						<button
							type="button"
							onclick={() => {
								confirmingClearAll = true;
								confirmingLoadSchemeId = null;
								confirmingDeleteSchemeId = null;
							}}
							class="border border-red-200 bg-white px-3 py-2 text-sm text-red-600 shadow-sm transition hover:bg-red-50"
						>
							Clear all slots
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if showCopyPanel}
		<div class="border border-gray-200 bg-white p-4 shadow-sm">
			<h3 class="mb-3 text-sm font-medium text-gray-900">Copy to days</h3>
			<form
				method="post"
				action="?/copyToWeekdays"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showCopyPanel = false;
						multiselect = false;
						selectedIds = new Set();
					};
				}}
			>
				<input type="hidden" name="ids" value={[...selectedIds].join(',')} />
				<input type="hidden" name="targetDays" value={[...copyTargetDays].join(',')} />
				<div class="mb-3 flex flex-wrap gap-2">
					{#each data.weekdays as day, i (i)}
						<label
							class="flex items-center gap-1.5 px-2 py-1 text-sm {selectedWeekday === i
								? 'cursor-not-allowed text-gray-400'
								: 'cursor-pointer text-gray-700 hover:bg-gray-50'}"
						>
							<input
								type="checkbox"
								checked={copyTargetDays.has(i)}
								disabled={selectedWeekday === i}
								onchange={() => {
									if (copyTargetDays.has(i)) {
										copyTargetDays = new Set([...copyTargetDays].filter((x) => x !== i));
									} else {
										copyTargetDays = new Set([...copyTargetDays, i]);
									}
								}}
								class="sr-only"
							/>
							<span
								class="inline-block h-4 w-4 border border-gray-400 {copyTargetDays.has(i)
									? 'bg-gray-900'
									: 'bg-white'}"
							></span>
							{day}
						</label>
					{/each}
				</div>
				<div class="flex gap-2">
					<button
						type="submit"
						class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
						disabled={copyTargetDays.size === 0}
					>
						Copy
					</button>
					<button
						type="button"
						onclick={() => (showCopyPanel = false)}
						class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if multiselect && selectedIds.size > 0}
		<div class="fixed right-0 bottom-0 left-0 z-50 border-t border-blue-200 bg-blue-50 px-4 py-2">
			<div class="mx-auto flex max-w-5xl items-center justify-between">
				<span class="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
				<div class="flex gap-2">
					<form
						id="bulk-delete-form"
						method="post"
						action="?/bulkDelete"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								confirmingBulkDelete = false;
								multiselect = false;
								selectedIds = new Set();
							};
						}}
					>
						<input type="hidden" name="ids" value={[...selectedIds].join(',')} />
						{#if confirmingBulkDelete}
							<button
								type="submit"
								class="border border-red-300 bg-red-50 px-3 py-1 text-sm font-medium text-red-700 transition hover:bg-red-100"
							>
								Confirm delete?
							</button>
						{:else}
							<button
								type="button"
								onclick={() => {
									confirmingBulkDelete = true;
								}}
								class="border border-red-200 bg-white px-3 py-1 text-sm text-red-600 transition hover:bg-red-50"
							>
								Delete selected
							</button>
						{/if}
					</form>
					<button
						onclick={() => (showCopyPanel = true)}
						class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-50"
					>
						Copy to...
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if showForm}
		{@const editing = editingSlot()}
		<form
			bind:this={createFormEl}
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
			<div class="flex gap-3">
				<label class="w-36">
					<span class="text-sm font-medium text-gray-700">Day</span>
					<select
						name="weekday"
						required
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						{#each data.weekdays as day, i (i)}
							<option value={i} selected={editing ? editing.weekday === i : selectedWeekday === i}
								>{day}</option
							>
						{/each}
					</select>
				</label>
				<label class="w-28">
					<span class="text-sm font-medium text-gray-700">Time</span>
					<input
						bind:this={timeInput}
						name="startTime"
						type="time"
						required
						value={editing?.startTime ?? prefillTime}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<label class="w-24">
					<span class="text-sm font-medium text-gray-700">Duration</span>
					<input
						name="durationMinutes"
						type="number"
						min="15"
						step="15"
						value={editing?.durationMinutes ?? prefillDuration}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			</div>
			<div class="flex gap-3">
				<label class="w-36">
					<span class="text-sm font-medium text-gray-700">Mode</span>
					<select
						name="mode"
						required
						bind:value={slotMode}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						<option value="activity">Activity</option>
						<option value="category">Category</option>
					</select>
				</label>
				{#if slotMode === 'category'}
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">Category</span>
						<select
							name="categoryId"
							required
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.categories as cat (cat.id)}
								<option value={cat.id} selected={editing?.categoryId === cat.id}>{cat.name}</option>
							{/each}
						</select>
					</label>
				{:else}
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">Activity</span>
						<select
							name="activityId"
							required
							bind:value={activityChoice}
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.activities as act (act.id)}
								<option value={String(act.id)}>{act.name}</option>
							{/each}
							<option value={NEW_ACTIVITY}>+ New activity...</option>
						</select>
					</label>
				{/if}
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">Label (optional)</span>
					<input
						name="label"
						type="text"
						autocomplete="off"
						value={editing?.label ?? ''}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			</div>
			{#if slotMode === 'activity' && activityChoice === NEW_ACTIVITY}
				<div class="flex gap-3 border border-gray-200 bg-gray-50 p-3">
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">New activity name</span>
						<input
							name="newActivityName"
							type="text"
							required
							autocomplete="off"
							use:autofocus
							placeholder="e.g. learn russian"
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
					<label class="w-44">
						<span class="text-sm font-medium text-gray-700">Its category</span>
						<select
							name="newActivityCategoryId"
							required
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.categories as cat (cat.id)}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</label>
				</div>
			{/if}
			<MetaEditor initial={parseSlotMeta(editing?.meta)} />
			<button
				type="submit"
				class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				{editingId ? 'Update' : 'Create'}
			</button>
		</form>
	{/if}

	{#if showExceptionalForm}
		<form
			method="post"
			action="?/createExceptional"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showExceptionalForm = false;
				};
			}}
			class="space-y-3 border border-blue-200 bg-blue-50 p-4 shadow-sm"
		>
			<h3 class="text-sm font-medium text-gray-900">
				New exception for {selectedDayInfo.name}
			</h3>
			<input type="hidden" name="date" value={selectedDateStr()} />
			<div class="flex gap-3">
				<label class="w-28">
					<span class="text-sm font-medium text-gray-700">Time</span>
					<input
						name="startTime"
						type="time"
						required
						value="09:00"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<label class="w-24">
					<span class="text-sm font-medium text-gray-700">Duration</span>
					<input
						name="durationMinutes"
						type="number"
						min="15"
						step="15"
						value="60"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			</div>
			<div class="flex gap-3">
				<label class="w-36">
					<span class="text-sm font-medium text-gray-700">Mode</span>
					<select
						name="mode"
						required
						bind:value={exceptionalMode}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						<option value="activity">Activity</option>
						<option value="category">Category</option>
					</select>
				</label>
				{#if exceptionalMode === 'category'}
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">Category</span>
						<select
							name="categoryId"
							required
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.categories as cat (cat.id)}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</label>
				{:else}
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">Activity</span>
						<select
							name="activityId"
							required
							bind:value={exceptionalActivityChoice}
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.activities as act (act.id)}
								<option value={String(act.id)}>{act.name}</option>
							{/each}
							<option value={NEW_ACTIVITY}>+ New activity...</option>
						</select>
					</label>
				{/if}
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">Label (optional)</span>
					<input
						name="label"
						type="text"
						autocomplete="off"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			</div>
			{#if exceptionalMode === 'activity' && exceptionalActivityChoice === NEW_ACTIVITY}
				<div class="flex gap-3 border border-gray-200 bg-white p-3">
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">New activity name</span>
						<input
							name="newActivityName"
							type="text"
							required
							autocomplete="off"
							use:autofocus
							placeholder="e.g. dentist appointment"
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
					<label class="w-44">
						<span class="text-sm font-medium text-gray-700">Its category</span>
						<select
							name="newActivityCategoryId"
							required
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.categories as cat (cat.id)}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</label>
				</div>
			{/if}
			<MetaEditor initial={{}} />
			<div class="flex gap-2">
				<button
					type="submit"
					class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Create Exception
				</button>
				<button
					type="button"
					onclick={() => (showExceptionalForm = false)}
					class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	{#if viewMode === 'list'}
		<div class="flex gap-1">
			{#each data.range.days as day, i (day.date)}
				<button
					onclick={() => (selectedOffset = i)}
					class="flex-1 border px-2 py-2 text-center text-xs font-medium transition {selectedOffset ===
					i
						? 'border-gray-900 bg-gray-900 text-white'
						: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
					title={day.date}
				>
					{day.isToday ? 'Today' : day.name.slice(0, 3)}
				</button>
			{/each}
		</div>
	{/if}

	{#if viewMode === 'list'}
		{#if slotsForDay(selectedWeekday).length === 0 && exceptionalSlotsForDay().length === 0}
			<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
				No slots for {selectedDayInfo.name}.
			</div>
		{:else}
			{#if slotsForDay(selectedWeekday).length > 0}
				<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
					{#each slotsForDay(selectedWeekday) as slot, i (slot.id)}
						{@const isSelected = selectedIds.has(slot.id)}
						{@const suppressed = isSlotSuppressed(slot.id)}
						<div
							class="flex items-center gap-4 border-l-4 px-4 py-3 {!slot.active || suppressed
								? 'opacity-50'
								: ''} {selectedIndex === i ? 'bg-gray-100' : ''} {isSelected ? 'bg-blue-50' : ''}"
							style="border-left-color: {catColor(slot.categoryId)}"
						>
							{#if multiselect}
								<button
									type="button"
									onclick={() => toggleSlotSelection(slot.id)}
									class="h-5 w-5 shrink-0 border {isSelected
										? 'border-blue-500 bg-blue-500'
										: 'border-gray-400 bg-white'}"
									aria-label={isSelected ? 'Deselect' : 'Select'}
								>
									{#if isSelected}
										<svg class="h-full w-full text-white" viewBox="0 0 20 20" fill="currentColor">
											<path
												fill-rule="evenodd"
												d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
												clip-rule="evenodd"
											/>
										</svg>
									{/if}
								</button>
							{/if}
							<div
								class="w-24 shrink-0 font-mono text-sm text-gray-500"
								title={formatDuration(slot.durationMinutes)}
							>
								{slot.startTime} - {computeEndTime(slot.startTime, slot.durationMinutes)}
							</div>
							<div class="min-w-0 flex-1">
								<span class="text-sm font-medium text-gray-900 {suppressed ? 'line-through' : ''}"
									>{slotLabel(slot)}</span
								>
								{#if slot.mode === 'activity' && slot.categoryName}
									<span class="ml-1 text-xs text-gray-400">{slot.categoryName}</span>
								{/if}
								{#if suppressed}
									<span class="ml-1 text-xs text-amber-600">skipped this day</span>
								{/if}
								{#if slot.label && slotLabel(slot) !== slot.label}
									<p class="truncate text-xs text-gray-500">{slot.label}</p>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if suppressed}
									<form method="post" action="?/unsuppress" use:enhance>
										<input type="hidden" name="slotId" value={slot.id} />
										<input type="hidden" name="date" value={selectedDateStr()} />
										<button
											type="submit"
											class="border border-amber-200 bg-white px-2 py-1 text-xs text-amber-600 transition hover:bg-amber-50"
										>
											Restore
										</button>
									</form>
								{:else}
									<form method="post" action="?/suppress" use:enhance>
										<input type="hidden" name="slotId" value={slot.id} />
										<input type="hidden" name="date" value={selectedDateStr()} />
										<button
											type="submit"
											class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
											title="Skip this slot for this day only"
										>
											Skip
										</button>
									</form>
								{/if}
								<button
									onclick={() => startEdit(slot)}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								>
									Edit
								</button>
								<form id="toggle-form-{slot.id}" method="post" action="?/toggleActive" use:enhance>
									<input type="hidden" name="id" value={slot.id} />
									<input type="hidden" name="active" value={String(slot.active)} />
									<button
										type="submit"
										class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
									>
										{slot.active ? 'Disable' : 'Enable'}
									</button>
								</form>
								{#if confirmingDelete === `slot-${slot.id}`}
									<form
										id="delete-form-{slot.id}"
										method="post"
										action="?/delete"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
												confirmingDelete = null;
											};
										}}
									>
										<input type="hidden" name="id" value={slot.id} />
										<button
											type="submit"
											class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
										>
											Confirm?
										</button>
									</form>
								{:else}
									<button
										type="button"
										onclick={() => {
											confirmingDelete = `slot-${slot.id}`;
										}}
										class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
									>
										Delete
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{@const dayExceptionals = exceptionalSlotsForDay()}
			{#if dayExceptionals.length > 0}
				<div class="divide-y divide-blue-100 border border-blue-200 bg-blue-50 shadow-sm">
					<div class="px-4 py-2 text-xs font-medium text-blue-700">Exceptions for this day</div>
					{#each dayExceptionals as exc (exc.id)}
						<div
							class="flex items-center gap-4 border-l-4 px-4 py-3"
							style="border-left-color: {catColor(exc.categoryId)}"
						>
							<div
								class="w-24 shrink-0 font-mono text-sm text-gray-500"
								title={formatDuration(exc.durationMinutes)}
							>
								{exc.startTime} - {computeEndTime(exc.startTime, exc.durationMinutes)}
							</div>
							<div class="min-w-0 flex-1">
								<span class="text-sm font-medium text-gray-900">{exceptionalLabel(exc)}</span>
								{#if exc.mode === 'activity' && exc.categoryName}
									<span class="ml-1 text-xs text-gray-400">{exc.categoryName}</span>
								{/if}
								{#if exc.label && exceptionalLabel(exc) !== exc.label}
									<p class="truncate text-xs text-gray-500">{exc.label}</p>
								{/if}
							</div>
							<span
								class="shrink-0 px-2 py-0.5 text-xs font-medium {exc.status === 'pending'
									? 'bg-gray-100 text-gray-600'
									: 'bg-blue-100 text-blue-700'}"
							>
								{exc.status}
							</span>
							{#if confirmingDelete === `exc-${exc.id}`}
								<form
									method="post"
									action="?/deleteExceptional"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											confirmingDelete = null;
										};
									}}
								>
									<input type="hidden" name="id" value={exc.id} />
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
									>
										Confirm?
									</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => {
										confirmingDelete = `exc-${exc.id}`;
									}}
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
								>
									Delete
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	{:else}
		<div class="h-[70vh] border border-gray-200 bg-white shadow-sm" use:gridZoomWheel>
			{#if browser}
				<Calendar bind:this={ec} plugins={[TimeGrid, Interaction]} options={gridOptions} />
			{/if}
		</div>
		<div class="mt-1 flex items-center justify-between gap-4">
			<p class="text-xs text-gray-400">
				Drag to create · drag a slot to move · hold <kbd
					class="border border-gray-300 bg-gray-50 px-1">Ctrl</kbd
				> while dragging to duplicate · snaps to 15min
			</p>
			<div class="flex items-center gap-1">
				<span class="mr-1 text-xs text-gray-400">
					Zoom (<kbd class="border border-gray-300 bg-gray-50 px-1">Ctrl</kbd>+scroll)
				</span>
				<button
					type="button"
					onclick={() => setZoom(zoomIndex - 1)}
					disabled={zoomIndex === 0}
					title="Zoom out (-)"
					aria-label="Zoom out"
					class="border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
					>&minus;</button
				>
				<button
					type="button"
					onclick={() => setZoom(GRID_DEFAULT_ZOOM_INDEX)}
					title="Reset zoom (0)"
					class="border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
					>{Math.round((slotHeight / GRID_ZOOM_LEVELS[GRID_DEFAULT_ZOOM_INDEX]) * 100)}%</button
				>
				<button
					type="button"
					onclick={() => setZoom(zoomIndex + 1)}
					disabled={zoomIndex === GRID_ZOOM_LEVELS.length - 1}
					title="Zoom in (+)"
					aria-label="Zoom in"
					class="border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
					>+</button
				>
			</div>
		</div>
		{#if hovered}
			<div
				class="pointer-events-none fixed z-50 max-w-[240px] border border-gray-200 bg-white px-3 py-2 shadow-sm"
				style:top="{hovered.top}px"
				style:left="{hovered.left}px"
				style:transform={hovered.flip ? 'translateX(-100%) translateX(-8px)' : 'translateX(8px)'}
			>
				<p class="text-sm font-medium text-gray-900">{hovered.title}</p>
				<p class="mt-0.5 text-xs text-gray-600">
					{hovered.timeText} · {hovered.durationText}
				</p>
				{#if hovered.categoryName}
					<p class="text-xs text-gray-500">{hovered.categoryName}</p>
				{/if}
				{#if hovered.label}
					<p class="text-xs text-gray-500">Label: {hovered.label}</p>
				{/if}
				{#if hovered.state}
					<p class="mt-0.5 text-xs font-medium text-gray-400">{hovered.state}</p>
				{/if}
			</div>
		{/if}
	{/if}

	<div class="mt-6 border border-gray-200 bg-white shadow-sm">
		<button
			type="button"
			onclick={() => (showCsvImport = !showCsvImport)}
			class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
		>
			Import CSV
			<span class="text-xs text-gray-400">{showCsvImport ? '▲' : '▼'}</span>
		</button>
		{#if showCsvImport}
			<form
				method="post"
				action="?/importCsv"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
					};
				}}
				class="space-y-3 border-t border-gray-200 px-4 py-4"
			>
				<p class="text-xs text-gray-500">
					Format: h (time), d (duration in min), then Mon-Sun activity names. Time: 610 = 06:10,
					1810 = 18:10.
				</p>
				<textarea
					name="csv"
					rows="8"
					placeholder={'h,d,m,t,w,t,f,s,s\n610,30,wake up,wake up,wake up,wake up,wake up,,\n630,60,alongar,regar plantas,alongar,regar plantas,alongar,,'}
					class="block w-full border border-gray-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				></textarea>
				<div class="flex items-center gap-4">
					<label class="flex items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" name="clearExisting" class="border-gray-300" />
						Clear existing plan
					</label>
				</div>
				<button
					type="submit"
					class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Import
				</button>
			</form>
		{/if}
	</div>
</div>

<style>
	:global(.og-event--inactive) {
		opacity: 0.5;
	}
	:global(.og-event--exceptional) {
		border-left: 3px solid #3b82f6;
	}
</style>
