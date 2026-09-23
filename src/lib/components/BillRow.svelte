<script lang="ts">
	/**
	 * One bill, wherever a bill is shown.
	 *
	 * This was written inside the Finance room, so a bill filed under a subject
	 * was a name and a number with a tick beside it — no way to say which line
	 * paid it, no undo, no putting it away, and a summary that left out the day
	 * it falls due. The verbs were not missing from the app; they were written
	 * into one page's markup. The same move as `GoalCard` and `IdeaCard`.
	 *
	 * Where it posts is a prop (`$lib/bill-action-names`); what it posts to is
	 * the same handler either way (`$lib/services/bill-actions`).
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { enhance } from '$lib/enhance';
	import { autofocus } from '$lib/actions/autofocus';
	import { asDecimal, summaryOf } from '$lib/bill-summary';
	import type { BillActionNames } from '$lib/bill-action-names';
	import type { Currency } from '$lib/money';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** What a row needs off a bill — `listBills` gives exactly this. */
	type Shown = {
		id: number;
		name: string;
		amountExpected: number;
		rhythm: string;
		dueDay: number | null;
		dueMonth: number | null;
		payLeadDays: number;
		active: boolean;
	};

	let {
		bill,
		currency,
		actions,
		/** Which period this row is about, and whether it is settled. */
		period,
		paid = false,
		/** Open the room's edit form. Absent where the screen has none. */
		onedit,
		/** Point at the statement line that paid it. Finance only. */
		onattach
	}: {
		bill: Shown;
		currency: Currency;
		actions: BillActionNames;
		period: string;
		paid?: boolean;
		onedit?: (id: number) => void;
		onattach?: (id: number) => void;
	} = $props();

	/** Whether the amount box is open on this row. */
	let paying = $state(false);
</script>

<li class="list-row">
	<div class="list-row-main">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-medium break-words text-gray-900">{bill.name}</span>
			{#if paid}
				<span class="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
					{t('finance.bills.paid')}
				</span>
			{/if}
		</div>
		<div class="text-xs text-gray-500">{summaryOf(t, bill, currency)}</div>
	</div>

	<div class="flex flex-1 flex-wrap items-center justify-end gap-2">
		{#if paid}
			<form method="post" action={actions.unpay} use:enhance>
				<input type="hidden" name="id" value={bill.id} />
				<input type="hidden" name="period" value={period} />
				<button
					class="icon-btn"
					title={t('finance.bills.undoThisPeriodSPayment')}
					aria-label={t('finance.bills.undoThePaymentFor', { name: bill.name })}
				>
					<Icon name="undo" />
				</button>
			</form>
		{:else if paying}
			<form
				method="post"
				action={actions.pay}
				class="flex items-center gap-1"
				use:enhance={() =>
					({ result, update }) => {
						if (result.type === 'success') paying = false;
						return update();
					}}
			>
				<input type="hidden" name="id" value={bill.id} />
				<input type="hidden" name="period" value={period} />
				<input
					name="amount"
					inputmode="decimal"
					use:autofocus
					class="input w-24"
					placeholder={asDecimal(bill.amountExpected)}
				/>
				<button class="btn btn-primary btn-sm" type="submit">{t('finance.bills.paid2')}</button>
				<button class="btn btn-sm" type="button" onclick={() => (paying = false)}>×</button>
			</form>
		{:else}
			<button
				class="icon-btn"
				title={t('finance.bills.markPaid')}
				aria-label={t('finance.bills.markPaid2', { name: bill.name })}
				onclick={() => (paying = true)}
			>
				<Icon name="check" />
			</button>
			<!--
				And the other way to pay one: point at the line that did it.

				The tick is somebody saying a bill was paid; this is the bank saying
				so, and the amount comes from the statement rather than from what was
				expected. Both are real — cash, a transfer that has not landed, an
				account this instance does not import — so neither replaces the
				other. Only where the statements are: a notebook is not where
				somebody goes through a bank export.
			-->
			{#if onattach}
				<button
					class="icon-btn"
					title={t('finance.bills.attachThePayment')}
					aria-label={t('finance.bills.attachATransactionTo', { name: bill.name })}
					onclick={() => onattach(bill.id)}
				>
					<Icon name="link" />
				</button>
			{/if}
		{/if}

		{#if onedit}
			<button
				class="icon-btn"
				aria-label={t('finance.bills.edit', { name: bill.name })}
				onclick={() => onedit(bill.id)}
			>
				<Icon name="edit" />
			</button>
		{/if}

		<form
			method="post"
			action={actions.archive}
			use:enhance
			title={t('finance.bills.putThisBillAway')}
		>
			<input type="hidden" name="id" value={bill.id} />
			<input type="hidden" name="archived" value={bill.active ? 'true' : 'false'} />
			<button class="icon-btn" aria-label={t('finance.bills.archive', { name: bill.name })}>
				<Icon name={bill.active ? 'archive' : 'undo'} />
			</button>
		</form>
	</div>
</li>
