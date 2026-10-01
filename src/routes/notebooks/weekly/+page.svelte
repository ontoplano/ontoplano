<script lang="ts">
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import Written from '$lib/components/Written.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { routeGlyph } from '$lib/glyphs';
	import { useWhen } from '$lib/when-context.svelte';
	import { rangeOf } from '$lib/when';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { listCursor } from '$lib/actions/list-cursor';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import type { PlainKey } from '$lib/i18n/keys';
	import type { ActionData, PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Week = PageServerData['weeks'][number];

	const DAY_MS = 86_400_000;
	const WEEK_DAYS = 7;

	/** What the search box holds: weeks whose note contains it. */
	let looking = $state('');

	/*
	 * The week it is about, or when it was last written — both newest first
	 * until somebody flips them.
	 */
	const ORDERS = ['week', 'edited'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		week: 'notebooks.weekly.orderWeek',
		edited: 'notebookDetail.orderEdited'
	};
	let order = $state<Order>('week');
	let direction = $state<'asc' | 'desc'>('desc');

	const shownWeeks = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		const found = needle
			? data.weeks.filter((one) => one.note.toLowerCase().includes(needle))
			: data.weeks;
		const sign = direction === 'asc' ? 1 : -1;
		const key = (one: Week) => (order === 'edited' ? one.updatedAt : one.weekStart);
		return [...found].sort((a, b) => sign * key(a).localeCompare(key(b)));
	});

	/* Nowhere until a key is pressed: a first row wearing the cursor reads as chosen. */
	let cursor = $state(-1);

	/**
	 * A year, a week at a time.
	 *
	 * The weekly note was reachable only from the week it belonged to, so the
	 * one running account this app keeps was write-only — and a thing you write
	 * and never see again is a thing you stop writing. Newest first, each one
	 * linked back to the week it is about.
	 */
	function weekLabel(weekStart: string): string {
		// Arithmetic on a string, not on a Date somebody could mutate: the seven
		// days of a week are fixed and this only has to name two of them.
		const first = new Date(`${weekStart}T00:00:00Z`);
		const last = new Date(first.getTime() + (WEEK_DAYS - 1) * DAY_MS);
		// Built out of UTC parts above, so it is read as UTC here too.
		return rangeOf(first, last, { ...now(), tz: 'UTC' });
	}

	/*
	 * The week a day falls in, counted from this week's first day — which the
	 * server snapped to the account's own week start, so this lands on the same
	 * seven days the review and the plan name.
	 */
	function weekOf(day: string): string {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return data.thisWeek;
		const anchor = Date.parse(`${data.thisWeek}T00:00:00Z`);
		const days = Math.round((Date.parse(`${day}T00:00:00Z`) - anchor) / DAY_MS);
		const start = anchor + Math.floor(days / WEEK_DAYS) * WEEK_DAYS * DAY_MS;
		return new Date(start).toISOString().slice(0, 10);
	}

	const reviewHref = (weekStart: string) => `${resolve('/tasks/review')}?week=${weekStart}`;

	/*
	 * One dialog for writing and rewriting: it is about a week, and a week has
	 * one note. Choosing a week that already has one brings that note in, so
	 * nothing is written over unseen.
	 */
	let showForm = $state(false);
	let pickedDay = $state('');
	let draft = $state('');
	const pickedWeek = $derived(weekOf(pickedDay));
	const existing = $derived(data.weeks.find((one) => one.weekStart === pickedWeek) ?? null);

	function openWeek(weekStart: string) {
		pickedDay = weekStart;
		draft = data.weeks.find((one) => one.weekStart === weekStart)?.note ?? '';
		showForm = true;
	}

	function pickDay(day: string) {
		pickedDay = day;
		draft = data.weeks.find((one) => one.weekStart === weekOf(day))?.note ?? '';
	}

	let confirmDelete = $state<string | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;
		if (document.querySelector('dialog[open]')) return;

		if (e.key === 'Escape') {
			confirmDelete = null;
			return;
		}

		const action = getAction('/notebooks/weekly', e.key);
		const here = shownWeeks[cursor];
		if (action === 'new') {
			e.preventDefault();
			openWeek(data.thisWeek);
		}
		if (action === 'edit' && here) {
			e.preventDefault();
			openWeek(here.weekStart);
		}
		if (action === 'open' && here) {
			e.preventDefault();
			// Already resolved: `reviewHref` builds it with `resolve()`.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			void goto(reviewHref(here.weekStart));
		}
		if (action === 'navigate-down' || action === 'navigate-up') {
			e.preventDefault();
			const max = shownWeeks.length - 1;
			if (max < 0) return;
			cursor = Math.min(Math.max(cursor + (action === 'navigate-down' ? 1 : -1), 0), max);
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('notebooks.weekly.writeANote'),
		tour: 'weekly-new',
		kbd: keyFor('/notebooks/weekly', 'new'),
		run: () => openWeek(data.thisWeek)
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
	No second heading: the room's name is above and the Weekly notes tab is
	lit, so a page saying it again said it three times.
-->
<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		One surface, and a week is a row on it — the search, the count and the
		order along its top, the way a notebook's Notes tab opens.
	-->
	<RoomSurface dataTour="weekly-list">
		{#snippet tools()}
			{#if data.weeks.length > 0}
				<FilterBar name="weekly" trailing={data.weeks.length > 1 ? orderControl : undefined}>
					{#snippet lead()}
						<SearchField bind:value={looking} label={t('notebooks.weekly.searchTheWeeks')} />
					{/snippet}
					{#snippet count()}
						<ShowingCount
							total={data.weeks.length}
							shown={shownWeeks.length}
							said={(count) => t('notebooks.weekly.showingCount', { count })}
						/>
					{/snippet}
				</FilterBar>
			{/if}
		{/snippet}
		{#if data.weeks.length === 0}
			<EmptyState
				icon={routeGlyph('/notebooks/weekly')!}
				title={t('notebooks.weekly.nothingWrittenYet')}
				description={t('notebooks.weekly.everyWeekYouWriteAbout')}
			/>
		{:else if shownWeeks.length === 0}
			<EmptyState filtered onclear={() => (looking = '')} />
		{:else}
			<div class="divide-y divide-gray-200">
				{#each shownWeeks as week, i (week.weekStart)}
					<!-- The rail is empty, so the week starts where every room's words do. -->
					<article use:listCursor={cursor === i} class="list-row items-start">
						<span class="row-rail"></span>
						<div class="list-row-main">
							<h2 class="tabular text-sm font-medium text-gray-900">
								{weekLabel(week.weekStart)}
							</h2>
							<Written content={week.note} class="mt-1" />
						</div>
						<div class="list-row-actions">
							{#if confirmDelete === week.weekStart}
								<form
									data-leaves
									method="post"
									action="?/remove"
									use:enhance={() =>
										async ({ update }) => {
											confirmDelete = null;
											await update();
										}}
									class="flex items-center gap-1"
								>
									<input type="hidden" name="weekStart" value={week.weekStart} />
									<button type="button" onclick={() => (confirmDelete = null)} class="btn btn-sm"
										>{t('ui.cancel')}</button
									>
									<button class="btn btn-danger btn-sm" use:armed
										>{t('notebooks.weekly.yesDelete')}</button
									>
								</form>
							{:else}
								<!-- Already resolved: `reviewHref` builds it with `resolve()`. -->
								<!-- eslint-disable svelte/no-navigation-without-resolve -->
								<a
									href={reviewHref(week.weekStart)}
									class="icon-btn"
									title={t('notebooks.weekly.openThatWeek')}
									aria-label={t('notebooks.weekly.openThatWeek')}
								>
									<Icon name="arrow-right" />
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
								<button
									type="button"
									class="icon-btn"
									title={t('ui.edit')}
									aria-label={t('ui.edit')}
									onclick={() => openWeek(week.weekStart)}
								>
									<Icon name="edit" />
								</button>
								<button
									type="button"
									class="icon-btn icon-btn-danger"
									title={t('ui.delete')}
									aria-label={t('ui.delete')}
									onclick={() => (confirmDelete = week.weekStart)}
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</RoomSurface>
</div>

{#snippet orderControl()}
	<SortControl
		value={order}
		options={ORDERS}
		labels={ORDER_LABELS}
		{direction}
		onpick={(next) => {
			order = next;
			direction = 'desc';
			cursor = -1;
		}}
		onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
		label={t('notebooks.weekly.orderWeeksBy')}
	/>
{/snippet}

<Modal
	bind:open={showForm}
	error={form?.message}
	title={existing ? t('notebooks.weekly.editNote') : t('notebooks.weekly.writeANote')}
>
	<form
		id="weekly-form"
		method="post"
		action="?/save"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') showForm = false;
			}}
	>
		<input type="hidden" name="weekStart" value={pickedWeek} />
		{#if !existing}<input type="hidden" name="fresh" value="1" />{/if}
		<FormGrid>
			<Field label={t('notebooks.weekly.weekOf')} span={6} hint={weekLabel(pickedWeek)}>
				<input
					type="date"
					class="input"
					value={pickedDay}
					onchange={(e) => pickDay(e.currentTarget.value)}
				/>
			</Field>
			<Field label={t('notebooks.weekly.theNote')} span={12}>
				<MarkdownBox
					name="note"
					rows={8}
					placeholder={t('tasks.review.whatWentWellWhatDid')}
					maxlength={data.noteMax}
					bind:value={draft}
				/>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="weekly-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>
