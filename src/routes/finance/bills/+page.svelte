<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';

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
	let showArchived = $state(false);
	/** The archived bill waiting on its delete confirmation, in its own dialog. */
	let confirmingDelete: (typeof data.bills)[number] | null = $state(null);

	// Monthly first — it is the common bill and the service's own default, so the
	// select lands on it when nobody changes the dropdown.
	const RHYTHMS = [
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'yearly', label: 'Yearly' },
		{ value: 'once', label: 'One-off' }
	];

	function rhythmLabel(r: string): string {
		return RHYTHMS.find((x) => x.value === r)?.label ?? r;
	}

	/** The rhythm the open form is on, so its due-day field asks the right thing. */
	let formRhythm = $state('monthly');

	const WEEKDAYS = [
		{ value: 1, label: 'Monday' },
		{ value: 2, label: 'Tuesday' },
		{ value: 3, label: 'Wednesday' },
		{ value: 4, label: 'Thursday' },
		{ value: 5, label: 'Friday' },
		{ value: 6, label: 'Saturday' },
		{ value: 7, label: 'Sunday' }
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
</script>

<div class="space-y-5">
	<!-- The month at a glance. -->
	<div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded border border-gray-200 p-4">
		<div>
			<div class="text-xs text-gray-500">Expected this month</div>
			<div class="text-lg font-semibold text-gray-900">{money(data.summary.expected)}</div>
		</div>
		<div>
			<div class="text-xs text-gray-500">Paid so far</div>
			<div class="text-lg font-semibold text-gray-900">{money(data.summary.paid)}</div>
		</div>
		<div>
			<div class="text-xs text-gray-500">Difference</div>
			<div class="text-lg font-semibold text-gray-900">{gapText(data.summary.difference)}</div>
		</div>
		<div class="ml-auto">
			<button class="btn btn-primary btn-sm" onclick={openNew}>
				<Icon name="plus" /> New bill
			</button>
		</div>
	</div>

	{#if active.length === 0}
		<EmptyState
			icon="wallet"
			title="No bills yet"
			description="The bills you expect to pay live here. Mark one paid and it records what you actually paid."
		/>
	{:else}
		<ul class="divide-y divide-gray-100 rounded border border-gray-200">
			{#each active as bill (bill.id)}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
					<!-- The whole row on a phone: a name squeezed into four characters
					     beside three buttons is not a name. The buttons wrap under it
					     and sit beside it again as soon as there is room. -->
					<div class="min-w-full flex-1 sm:min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium break-words text-gray-900">{bill.name}</span>
							{#if bill.paidThisPeriod}
								<span class="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
									paid
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
								<button class="btn btn-sm" title="Undo this period's payment">Undo</button>
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
								<button class="btn btn-primary btn-sm" type="submit">Paid</button>
								<button class="btn btn-sm" type="button" onclick={() => (paying = null)}>×</button>
							</form>
						{:else}
							<button class="btn btn-sm" onclick={() => (paying = bill.id)}>Mark paid</button>
						{/if}

						<button class="icon-btn" aria-label="Edit {bill.name}" onclick={() => openEdit(bill)}>
							<Icon name="edit" />
						</button>

						<form
							method="post"
							action="?/archive"
							use:enhance
							title="Put this bill away — its history stays"
						>
							<input type="hidden" name="id" value={bill.id} />
							<input type="hidden" name="archived" value="true" />
							<button class="icon-btn" aria-label="Archive {bill.name}">
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
				<Icon name={showArchived ? 'chevron-down' : 'chevron-right'} /> Archived ({archived.length})
			</button>
			{#if showArchived}
				<ul class="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
					{#each archived as bill (bill.id)}
						<li class="flex items-center gap-3 px-4 py-2 text-sm">
							<span class="min-w-0 flex-1 text-gray-600">{bill.name}</span>
							<span class="text-xs text-gray-400">{money(bill.amountExpected)}</span>
							<form method="post" action="?/archive" use:enhance>
								<input type="hidden" name="id" value={bill.id} />
								<input type="hidden" name="archived" value="false" />
								<button class="btn btn-sm" type="submit">Restore</button>
							</form>
							<!-- An archived bill is still a bill: correcting its amount or its
							     name should not need restoring it first. -->
							<button class="icon-btn" aria-label="Edit {bill.name}" onclick={() => openEdit(bill)}>
								<Icon name="edit" />
							</button>
							<button
								class="icon-btn"
								aria-label="Delete {bill.name}"
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
	title={editing ? 'Edit bill' : 'New bill'}
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
				<span class="text-gray-600">Name</span>
				<input
					name="heading"
					required
					use:autofocus
					value={editing?.name ?? ''}
					class="input mt-1 w-full"
					placeholder="Rent"
				/>
			</label>
			<label class="block text-sm">
				<span class="text-gray-600">Expected amount</span>
				<input
					name="amount"
					inputmode="decimal"
					value={editing ? asDecimal(editing.amountExpected) : ''}
					class="input mt-1 w-full"
					placeholder="0,00"
				/>
			</label>
			<label class="block text-sm">
				<span class="text-gray-600">Rhythm</span>
				<select
					name="rhythm"
					class="input mt-1 w-full"
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
					<span class="text-gray-600">Due on</span>
					<select name="dueDay" class="input mt-1 w-full" value={editing?.dueDay ?? 5}>
						{#each WEEKDAYS as d (d.value)}<option value={d.value}>{d.label}</option>{/each}
					</select>
					<span class="mt-1 block text-xs text-gray-500">The last day it can be paid.</span>
				</label>
			{:else if formRhythm === 'yearly'}
				<label class="block text-sm">
					<span class="text-gray-600">Due month</span>
					<select name="dueMonth" class="input mt-1 w-full" value={editing?.dueMonth ?? 1}>
						{#each MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
					</select>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">Due day of that month</span>
					<input
						name="dueDay"
						type="number"
						min="1"
						max="28"
						value={editing?.dueDay ?? ''}
						class="input mt-1 w-full"
						placeholder="15"
					/>
					<span class="mt-1 block text-xs text-gray-500">The last day it can be paid.</span>
				</label>
			{:else}
				<label class="block text-sm">
					<span class="text-gray-600">Due day of the month</span>
					<input
						name="dueDay"
						type="number"
						min="1"
						max="28"
						value={editing?.dueDay ?? ''}
						class="input mt-1 w-full"
						placeholder="5"
					/>
					<span class="mt-1 block text-xs text-gray-500">The last day it can be paid.</span>
				</label>
			{/if}
			<label class="block text-sm">
				<span class="text-gray-600">Pay it this many days before</span>
				<input
					name="payLeadDays"
					type="number"
					min="0"
					max="27"
					value={editing?.payLeadDays ?? 0}
					class="input mt-1 w-full"
					placeholder="0"
				/>
				<span class="mt-1 block text-xs text-gray-500">
					When it turns up on your week. 0 is the due day itself.
				</span>
			</label>
		</div>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showForm = false)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="bill-form">
			{editing ? 'Save' : 'Add'}
		</button>
	{/snippet}
</Modal>

<!-- Hard delete, only from the archived list, confirmed in its own dialog so
     the confirm button is never where the delete button was. -->
<Modal
	open={confirmingDelete !== null}
	title="Delete this bill?"
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.name}</strong> and its whole payment history are deleted for good. To
			keep the history, leave it archived instead.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}>Keep it</button>
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
			<button class="btn btn-danger" type="submit" use:armed>Delete</button>
		</form>
	{/snippet}
</Modal>
