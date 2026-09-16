<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { enhance } from '$app/forms';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';
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
	let paying: number | null = $state(null);
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
	const RHYTHMS = [
		{ value: 'monthly', label: 'app.monthly' },
		{ value: 'weekly', label: 'app.weekly' },
		{ value: 'yearly', label: 'app.yearly' },
		{ value: 'once', label: 'app.oneOff' }
	];

	function rhythmLabel(r: string): string {
		return RHYTHMS.find((x) => x.value === r)?.label ?? r;
	}

	/** The rhythm the open form is on, so its due-day field asks the right thing. */
	let formRhythm = $state('monthly');

	const WEEKDAYS = [
		{ value: 1, label: 'app.monday' },
		{ value: 2, label: 'app.tuesday' },
		{ value: 3, label: 'app.wednesday' },
		{ value: 4, label: 'app.thursday' },
		{ value: 5, label: 'app.friday' },
		{ value: 6, label: 'app.saturday' },
		{ value: 7, label: 'app.sunday' }
	];
	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

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
		if (diff === 0) return 'on plan';
		return diff > 0 ? `${money(diff)} over` : `${money(-diff)} under`;
	}

	// A cents amount as the decimal the field shows, so editing starts from the
	// real value rather than blank.
	const asDecimal = (cents: number) => (cents / 100).toFixed(2);

	/** "R$120,00 · Monthly, due the 5, pay 2 days before" — one line, one string. */
	function summaryOf(bill: (typeof data.bills)[number]): string {
		let line = `${money(bill.amountExpected)} · ${rhythmLabel(bill.rhythm)}`;
		if (bill.dueDay) {
			if (bill.rhythm === 'weekly') {
				line += `, due ${WEEKDAYS.find((d) => d.value === bill.dueDay)?.label ?? ''}s`;
			} else if (bill.rhythm === 'yearly') {
				line += `, due ${MONTHS[(bill.dueMonth ?? 1) - 1]} ${bill.dueDay}`;
			} else {
				line += `, due the ${bill.dueDay}`;
			}
			if (bill.payLeadDays > 0)
				line += `, pay ${bill.payLeadDays} ${bill.payLeadDays === 1 ? 'day' : 'days'} before`;
		}
		return line;
	}

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
			description="The bills you expect to pay live here. Mark one paid and it records what you actually paid."
		/>
	{:else}
		<ul class="divide-y divide-gray-100 rounded border border-gray-200">
			{#each active as bill (bill.id)}
				<li class="list-row">
					<div class="list-row-main">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium break-words text-gray-900">{bill.name}</span>
							{#if bill.paidThisPeriod}
								<span class="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
									{t('finance.bills.paid')}
								</span>
							{/if}
						</div>
						<div class="text-xs text-gray-500">{summaryOf(bill)}</div>
					</div>

					<div class="flex flex-1 flex-wrap items-center justify-end gap-2">
						{#if bill.paidThisPeriod}
							<form method="post" action="?/unpay" use:enhance>
								<input type="hidden" name="id" value={bill.id} />
								<input type="hidden" name="period" value={bill.period} />
								<button
									class="icon-btn"
									title={t('finance.bills.undoThisPeriodSPayment')}
									aria-label={t('finance.bills.undoThePaymentFor', { name: bill.name })}
								>
									<Icon name="undo" />
								</button>
							</form>
						{:else if paying === bill.id}
							<form
								method="post"
								action="?/pay"
								class="flex items-center gap-1"
								use:enhance={() =>
									({ result, update }) => {
										if (result.type === 'success') paying = null;
										return update();
									}}
							>
								<input type="hidden" name="id" value={bill.id} />
								<input type="hidden" name="period" value={data.periods[bill.id]} />
								<input
									name="amount"
									inputmode="decimal"
									use:autofocus
									class="input w-24"
									placeholder={asDecimal(bill.amountExpected)}
								/>
								<button class="btn btn-primary btn-sm" type="submit"
									>{t('finance.bills.paid2')}</button
								>
								<button class="btn btn-sm" type="button" onclick={() => (paying = null)}>×</button>
							</form>
						{:else}
							<button
								class="icon-btn"
								title={t('finance.bills.markPaid')}
								aria-label={t('finance.bills.markPaid2', { name: bill.name })}
								onclick={() => (paying = bill.id)}
							>
								<Icon name="check" />
							</button>
							<!--
								And the other way to pay one: point at the line that did it.
								
								The tick is somebody saying a bill was paid; this is the bank
								saying so, and the amount comes from the statement rather than
								from what was expected. Both are real — cash, a transfer that
								has not landed, an account this instance does not import — so
								neither replaces the other.
							-->
							<button
								class="icon-btn"
								title={t('finance.bills.attachThePayment')}
								aria-label={t('finance.bills.attachATransactionTo', { name: bill.name })}
								onclick={() => (attaching = bill.id)}
							>
								<Icon name="link" />
							</button>
						{/if}

						<button
							class="icon-btn"
							aria-label={t('finance.bills.edit', { name: bill.name })}
							onclick={() => openEdit(bill)}
						>
							<Icon name="edit" />
						</button>

						<form
							method="post"
							action="?/archive"
							use:enhance
							title={t('finance.bills.putThisBillAway')}
						>
							<input type="hidden" name="id" value={bill.id} />
							<input type="hidden" name="archived" value="true" />
							<button class="icon-btn" aria-label={t('finance.bills.archive', { name: bill.name })}>
								<Icon name="archive" />
							</button>
						</form>
					</div>
				</li>
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
							<span class="text-xs text-gray-400">{money(bill.amountExpected)}</span>
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
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block text-sm">
				<span class="text-gray-600">{t('ui.name')}</span>
				<OneLine
					name="heading"
					placeholder={t('finance.bills.rent')}
					value={editing?.name ?? ''}
					class="input mt-1 w-full"
					required
					autofocus
				/>
			</label>
			<label class="block text-sm">
				<span class="text-gray-600">{t('finance.bills.expectedAmount')}</span>
				<input
					name="amount"
					inputmode="decimal"
					value={editing ? asDecimal(editing.amountExpected) : ''}
					class="input mt-1 w-full"
					placeholder="0,00"
				/>
			</label>
			<label class="block text-sm">
				<span class="text-gray-600">{t('finance.bills.rhythm')}</span>
				<select
					name="rhythm"
					class="select mt-1 w-full"
					value={editing?.rhythm ?? 'monthly'}
					onchange={(e) => (formRhythm = (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each RHYTHMS as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
				</select>
			</label>
			<!-- One question, asked in the rhythm's own terms: a weekly bill falls
			     on a weekday, a yearly one on a date, a monthly one on a day. -->
			{#if formRhythm === 'weekly'}
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.bills.dueOn')}</span>
					<select name="dueDay" class="select mt-1 w-full" value={editing?.dueDay ?? 5}>
						{#each WEEKDAYS as d (d.value)}<option value={d.value}>{d.label}</option>{/each}
					</select>
					<span class="mt-1 block text-xs text-gray-500">{t('finance.bills.theLastDayItCan')}</span>
				</label>
			{:else if formRhythm === 'yearly'}
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.bills.dueMonth')}</span>
					<select name="dueMonth" class="select mt-1 w-full" value={editing?.dueMonth ?? 1}>
						{#each MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
					</select>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.bills.dueDayOfThatMonth')}</span>
					<NumberBox
						name="dueDay"
						min="1"
						max="28"
						value={editing?.dueDay ?? ''}
						class="mt-1 w-full"
						placeholder="15"
					/>
					<span class="mt-1 block text-xs text-gray-500">{t('finance.bills.theLastDayItCan')}</span>
				</label>
			{:else}
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.bills.dueDayOfTheMonth')}</span>
					<NumberBox
						name="dueDay"
						min="1"
						max="28"
						value={editing?.dueDay ?? ''}
						class="mt-1 w-full"
						placeholder="5"
					/>
					<span class="mt-1 block text-xs text-gray-500">{t('finance.bills.theLastDayItCan')}</span>
				</label>
			{/if}
			<label class="block text-sm">
				<span class="text-gray-600">{t('finance.bills.payItThisManyDays')}</span>
				<NumberBox
					name="payLeadDays"
					min="0"
					max="27"
					value={editing?.payLeadDays ?? 0}
					class="mt-1 w-full"
					placeholder="0"
				/>
				<span class="mt-1 block text-xs text-gray-500">
					{t('finance.bills.whenItTurnsUpOn')}
				</span>
			</label>
		</div>
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
	description="The amount comes from the line you pick, not from what the bill expected."
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
