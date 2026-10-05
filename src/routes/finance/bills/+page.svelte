<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import { dayOf, today } from '$lib/when';
	import { routeGlyph } from '$lib/glyphs';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData } from './$types';
	import BillList from '$lib/components/BillList.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import StatTiles from '$lib/components/StatTiles.svelte';
	import { browsable, typing } from '$lib/browse.svelte';
	import { getAction } from '$lib/shortcuts';
	import {
		BILL_ORDERS,
		BILL_ORDER_LABELS,
		directionFor,
		orderBills,
		type BillOrder
	} from '$lib/bill-order';
	import { BILL_ROOM_ACTIONS } from '$lib/bill-action-names';
	import { useT } from '$lib/i18n';
	import { RememberedOrder } from '$lib/remembered-order.svelte';

	const t = useT();
	const now = useWhen();

	const ROOM = '/finance/bills';

	let { data }: { data: PageServerData } = $props();

	const currency = $derived(data.currency as Currency);
	const money = (cents: number) => formatMoney(cents, currency);

	/** The list, which owns the new-and-edit form — see `BillList`. */
	let list = $state<ReturnType<typeof BillList>>();

	/** The bill whose payment is being pointed at a statement line. */
	let attaching: number | null = $state(null);
	/** Narrowing that list, because six weeks of a current account is long. */
	let movementQuery = $state('');

	const attachingBill = $derived(data.bills.find((b) => b.id === attaching) ?? null);
	const movementChoices = $derived(
		movementQuery.trim() === ''
			? data.recentMovements
			: data.recentMovements.filter((m) =>
					m.description.toLowerCase().includes(movementQuery.trim().toLowerCase())
				)
	);
	// A gap the account's way: paid over expected reads one way, under another.
	// Words, never colour alone — this is a difference, not a good/bad.
	function gapText(diff: number): string {
		if (diff === 0) return t('finance.bills.onPlan');
		return diff > 0
			? t('finance.bills.amountOver', { amount: money(diff) })
			: t('finance.bills.amountUnder', { amount: money(-diff) });
	}

	/** Finding one bill by name, and whether the put-away ones are listed. */
	let looking = $state('');
	let showArchived = $state(false);
	const needle = $derived(looking.trim().toLowerCase());

	/*
	 * The order, kept in this browser the way a notebook's notes keep theirs
	 * (`$lib/bill-order`). What falls due next first, until somebody says
	 * otherwise.
	 */
	const sorting = new RememberedOrder<BillOrder>(
		'bills',
		BILL_ORDERS,
		BILL_ORDERS[0],
		directionFor
	);

	const shownBills = $derived(
		orderBills(
			needle === '' ? data.bills : data.bills.filter((b) => b.name.toLowerCase().includes(needle)),
			sorting.order,
			sorting.direction,
			today(now())
		)
	);
	const putAway = $derived(data.bills.filter((b) => !b.active).length);
	/** The rows on screen, in the order `BillList` draws them: active, then archived. */
	const walked = $derived([
		...shownBills.filter((b) => b.active),
		...(showArchived ? shownBills.filter((b) => !b.active) : [])
	]);
	const showing = $derived(walked.length);

	let cursor = $state(-1);
	browsable(() => ({
		items: () => walked,
		cursor: () => cursor,
		moveTo: (i) => (cursor = i),
		edit: (i) => list?.openEdit(walked[i].id)
	}));

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (typing(event)) return;
		if (getAction(ROOM, event.key) === 'new') {
			event.preventDefault();
			list?.openNew();
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('finance.bills.newBill'),
		run: () => list?.openNew(),
		kbd: 'n'
	}));
</script>

<svelte:window {onkeydown} />

<!--
	One surface: what narrows the list along its top, the month at a glance
	under it, and the bills edge to edge — the shape the task list has.
-->
<RoomSurface>
	{#snippet tools()}
		<FilterBar
			name="bills"
			on={needle !== '' || showArchived}
			summary={[
				looking.trim(),
				showArchived ? t('finance.bills.archived', { length: putAway }) : ''
			]
				.filter(Boolean)
				.join(', ')}
			onclear={() => {
				looking = '';
				showArchived = false;
			}}
		>
			{#snippet lead()}
				<SearchField bind:value={looking} label={t('finance.bills.searchBills')} />
			{/snippet}
			{#snippet count()}
				<ShowingCount
					total={data.bills.length}
					shown={showing}
					said={(count) => t('finance.bills.showingCount', { count })}
				/>
			{/snippet}
			{#snippet inline()}
				<!-- The only filter this list has, so it stays out on a phone too. -->
				<button
					type="button"
					onclick={() => (showArchived = !showArchived)}
					aria-pressed={showArchived}
					class="btn btn-sm shrink-0"
					hidden={putAway === 0 && !showArchived}
				>
					{t('finance.bills.archived', { length: putAway })}
				</button>
			{/snippet}
			{#snippet trailing()}
				<SortControl
					value={sorting.order}
					options={BILL_ORDERS}
					labels={BILL_ORDER_LABELS}
					direction={sorting.direction}
					onpick={(next) => sorting.pick(next)}
					onflip={() => sorting.flip()}
					label={t('sort.order')}
				/>
			{/snippet}
		</FilterBar>
	{/snippet}

	<!-- The month at a glance. -->
	<StatTiles
		tiles={[
			{ label: t('finance.bills.expectedThisMonth'), value: money(data.summary.expected) },
			{ label: t('finance.bills.paidSoFar'), value: money(data.summary.paid) },
			{ label: t('finance.bills.difference'), value: gapText(data.summary.difference) }
		]}
	/>

	<!--
		The same list a notebook's Bills tab draws, with the same form: see
		`BillList`. Only this room can point a payment at a statement line.
	-->
	<BillList
		bind:this={list}
		bind:showArchived
		archiveToggle={false}
		bills={shownBills}
		{cursor}
		{currency}
		actions={BILL_ROOM_ACTIONS}
		notebooks={data.notebooks}
		onattach={(id) => (attaching = id)}
	>
		{#snippet empty()}
			{#if needle !== ''}
				<EmptyState
					filtered
					onclear={() => {
						looking = '';
						showArchived = false;
					}}
					description={t('finance.bills.noneMatch')}
				/>
			{:else}
				<EmptyState
					icon={routeGlyph('/finance/bills')!}
					title={t('finance.bills.noBillsYet')}
					description={t('finance.bills.theBillsYouExpectTo')}
				/>
			{/if}
		{/snippet}
	</BillList>
</RoomSurface>

<!--
	Which line paid this bill.

	A list rather than a search box with an id in it: nobody knows a
	transaction's number, they know it was about forty euros to the energy
	company around the tenth. So it is the recent money-out of every ledger,
	newest first, with a filter for when the list is long.
-->
<Modal
	open={attaching !== null}
	title={attachingBill
		? t('finance.bills.whatPaidName', { name: attachingBill.name })
		: t('finance.bills.whatPaidIt')}
	description={t('finance.bills.theAmountComesFromThe')}
	onclose={() => {
		attaching = null;
		movementQuery = '';
	}}
>
	{#if attachingBill}
		<OneLine
			name="movementSearch"
			bind:value={movementQuery}
			placeholder={t('finance.bills.filterByDescription')}
			class="input w-full"
		/>

		{#if movementChoices.length === 0}
			<p class="mt-3 text-sm text-gray-500">
				{t('finance.bills.nothingInTheLastFew')}
			</p>
		{:else}
			<ul class="mt-3 max-h-80 divide-y divide-gray-200 overflow-y-auto border border-gray-200">
				{#each movementChoices as movement (movement.id)}
					<li>
						<form
							method="post"
							action="?/payFromMovement"
							use:enhance={() =>
								async ({ result, update }) => {
									if (result.type === 'success') {
										attaching = null;
										movementQuery = '';
									}
									await update();
								}}
						>
							<input type="hidden" name="id" value={attachingBill.id} />
							<input type="hidden" name="period" value={attachingBill.period} />
							<input type="hidden" name="movementId" value={movement.id} />
							<button
								class="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
							>
								<span class="shrink-0 text-xs text-gray-500 tabular-nums">
									{dayOf(movement.occurredOn, now())}
								</span>
								<span class="min-w-0 flex-1 truncate text-gray-900">{movement.description}</span>
								<span class="shrink-0 text-xs text-gray-700 tabular-nums">
									{money(Math.abs(movement.amountCents))}
								</span>
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#snippet footer()}
		<button
			type="button"
			class="btn"
			onclick={() => {
				attaching = null;
				movementQuery = '';
			}}
		>
			{t('ui.cancel')}
		</button>
	{/snippet}
</Modal>
