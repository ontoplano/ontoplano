<script lang="ts">
	import { setRoomAction } from '$lib/room-action.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';
	import BillRow from '$lib/components/BillRow.svelte';
	import { BILL_ROOM_ACTIONS } from '$lib/bill-action-names';
	import BillFields from '$lib/components/fields/BillFields.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const currency = $derived(data.currency as Currency);
	const money = (cents: number) => formatMoney(cents, currency);

	const active = $derived(data.bills.filter((b) => b.active));
	const archived = $derived(data.bills.filter((b) => !b.active));

	// The form modal does both jobs: no editing id is a new bill, an id is that
	// bill being changed — one form, so the two can never drift apart.
	let showForm = $state(false);
	let editing: (typeof data.bills)[number] | null = $state(null);
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
	let showArchived = $state(false);
	/** The archived bill waiting on its delete confirmation, in its own dialog. */
	let confirmingDelete: (typeof data.bills)[number] | null = $state(null);

	// Monthly first — it is the common bill and the service's own default, so the
	// select lands on it when nobody changes the dropdown.
	/** The rhythm the open form is on, so its due-day field asks the right thing. */
	let formRhythm = $state('monthly');

	function openNew() {
		editing = null;
		formRhythm = 'monthly';
		showForm = true;
	}
	function openEdit(bill: (typeof data.bills)[number]) {
		editing = bill;
		formRhythm = bill.rhythm;
		showForm = true;
	}

	// A gap the account's way: paid over expected reads one way, under another.
	// Words, never colour alone — this is a difference, not a good/bad.
	function gapText(diff: number): string {
		if (diff === 0) return t('finance.bills.onPlan');
		return diff > 0
			? t('finance.bills.amountOver', { amount: money(diff) })
			: t('finance.bills.amountUnder', { amount: money(-diff) });
	}

	// A cents amount as the decimal the field shows, so editing starts from the
	// real value rather than blank.

	/** "R$120,00 · Monthly, due the 5, pay 2 days before" — one line, one string. */
	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({ label: t('finance.bills.newBill'), run: openNew }));
</script>

<div class="space-y-5">
	<!-- The month at a glance. -->
	<div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded border border-gray-200 p-4">
		<div>
			<div class="text-xs text-gray-500">{t('finance.bills.expectedThisMonth')}</div>
			<div class="text-lg font-semibold text-gray-900">{money(data.summary.expected)}</div>
		</div>
		<div>
			<div class="text-xs text-gray-500">{t('finance.bills.paidSoFar')}</div>
			<div class="text-lg font-semibold text-gray-900">{money(data.summary.paid)}</div>
		</div>
		<div>
			<div class="text-xs text-gray-500">{t('finance.bills.difference')}</div>
			<div class="text-lg font-semibold text-gray-900">{gapText(data.summary.difference)}</div>
		</div>
	</div>

	{#if active.length === 0}
		<EmptyState
			icon="wallet"
			title={t('finance.bills.noBillsYet')}
			description={t('finance.bills.theBillsYouExpectTo')}
		/>
	{:else}
		<ul class="divide-y divide-gray-100 rounded border border-gray-200">
			{#each active as bill (bill.id)}
				<!--
					The row is a component, so a bill filed under a notebook is the
					same bill this room shows — see `BillRow`.
				-->
				<BillRow
					{bill}
					{currency}
					actions={BILL_ROOM_ACTIONS}
					period={data.periods[bill.id]}
					paid={bill.paidThisPeriod}
					onedit={() => openEdit(bill)}
					onattach={(id) => (attaching = id)}
				/>
			{/each}
		</ul>
	{/if}

	{#if archived.length > 0}
		<div>
			<button
				class="text-sm text-gray-500 hover:text-gray-700"
				onclick={() => (showArchived = !showArchived)}
			>
				<Icon name={showArchived ? 'chevron-down' : 'chevron-right'} />{t(
					'finance.bills.archived',
					{ length: archived.length }
				)}</button
			>
			{#if showArchived}
				<ul class="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
					{#each archived as bill (bill.id)}
						<li class="flex items-center gap-3 px-4 py-2 text-sm">
							<span class="min-w-0 flex-1 text-gray-600">{bill.name}</span>
							<span class="text-xs text-gray-500">{money(bill.amountExpected)}</span>
							<form method="post" action="?/archive" use:enhance>
								<input type="hidden" name="id" value={bill.id} />
								<input type="hidden" name="archived" value="false" />
								<button class="btn btn-sm" type="submit">{t('finance.bills.restore')}</button>
							</form>
							<!-- An archived bill is still a bill: correcting its amount or its
							     name should not need restoring it first. -->
							<button
								class="icon-btn"
								aria-label={t('finance.bills.edit', { name: bill.name })}
								onclick={() => openEdit(bill)}
							>
								<Icon name="edit" />
							</button>
							<button
								class="icon-btn"
								aria-label={t('finance.bills.delete', { name: bill.name })}
								onclick={() => (confirmingDelete = bill)}
							>
								<Icon name="trash" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<!-- New / edit, one form. -->
<Modal
	bind:open={showForm}
	error={form?.message}
	title={editing ? t('finance.bills.editBill') : t('finance.bills.newBill')}
	onclose={() => (editing = null)}
	size="sm"
>
	<form
		id="bill-form"
		method="post"
		action={editing ? '?/update' : '?/create'}
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') showForm = false;
				return update({ reset: result.type === 'success' });
			}}
	>
		{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
		<BillFields {editing} bind:rhythm={formRhythm} notebooks={data.notebooks} />
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="bill-form">
			{editing ? 'Save' : 'Add'}
		</button>
	{/snippet}
</Modal>

<!-- Hard delete, only from the archived list, confirmed in its own dialog so
     the confirm button is never where the delete button was. -->
<Modal
	open={confirmingDelete !== null}
	title={t('finance.bills.deleteThisBill')}
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.name}</strong>
			{t('finance.bills.andItsWholePaymentHistory')}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}
			>{t('finance.bills.keepIt')}</button
		>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingDelete = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>

<!--
	Which line paid this bill.

	A list rather than a search box with an id in it: nobody knows a
	transaction's number, they know it was about forty euros to the energy
	company around the tenth. So it is the recent money-out of every ledger,
	newest first, with a filter for when the list is long.
-->
<Modal
	open={attaching !== null}
	title={attachingBill ? `What paid ${attachingBill.name}?` : t('finance.bills.whatPaidIt')}
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
									{movement.occurredOn.slice(5)}
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
