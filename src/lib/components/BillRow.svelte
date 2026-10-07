<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
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
	 * the same handler either way (`$lib/services/bill-actions`). `BillList`
	 * draws these, with the form and the delete confirmation, on both screens.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import RowCard from '$lib/components/RowCard.svelte';
	import { enhance } from '$lib/enhance';
	import { say } from '$lib/said.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { listCursor } from '$lib/actions/list-cursor';
	import { autofocus } from '$lib/actions/autofocus';
	import { AVERAGE_LABEL, asDecimal, summaryOf } from '$lib/bill-summary';
	import type { BillActionNames } from '$lib/bill-action-names';
	import { formatMoney, type Currency } from '$lib/money';
	import { dateOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** One settled period, as `listPayments` gives it. */
	type Entry = {
		id: number;
		period: string;
		amountExpected: number;
		amountPaid: number;
		status: 'paid' | 'skipped';
		automatic: boolean;
		paidAt: string;
	};

	/** What a row needs off a bill — `listBillsThisPeriod` gives exactly this. */
	type Shown = {
		id: number;
		name: string;
		amountExpected: number;
		rhythm: string;
		dueDay: number | null;
		dueMonth: number | null;
		payLeadDays: number;
		automatic: boolean;
		active: boolean;
		history: {
			entries: Entry[];
			paidCount: number;
			skippedCount: number;
			totalPaid: number;
			averagePaid: number | null;
		};
	};

	let {
		bill,
		currency,
		actions,
		/** Which period this row is about, and how it was settled. */
		period,
		paid = false,
		skipped = false,
		/** Open the edit form. */
		onedit,
		/** Ask to delete it for good — offered on an archived bill only. */
		ondelete,
		/** Point at the statement line that paid it. Finance only. */
		onattach,
		/** Whether the keyboard's cursor is on this row. */
		here = false
	}: {
		bill: Shown;
		currency: Currency;
		actions: BillActionNames;
		period: string;
		paid?: boolean;
		skipped?: boolean;
		onedit?: (id: number) => void;
		ondelete?: (id: number) => void;
		onattach?: (id: number) => void;
		here?: boolean;
	} = $props();

	/** Whether the amount box is open on this row. */
	let paying = $state(false);
	/** Whether the history is open under it. A person's own act, so it may push. */
	let expanded = $state(false);

	const money = (cents: number) => formatMoney(cents, currency);

	/*
	 * What the row shows while a press is on its way.
	 *
	 * Paying waited for the server before the tick appeared, long enough to
	 * press again. The press sets this, the row draws it at once, and the
	 * page's data replacing `paid`/`skipped` clears it; a refusal puts it back.
	 */
	let pressed = $state<{ paid: boolean; skipped: boolean } | null>(null);
	$effect(() => {
		void paid;
		void skipped;
		pressed = null;
	});
	const shownPaid = $derived(pressed ? pressed.paid : paid);
	const shownSkipped = $derived(pressed ? pressed.skipped : skipped);

	/** A press that flips the row now and keeps it flipped unless refused. */
	function flips(to: { paid: boolean; skipped: boolean }): SubmitFunction {
		return () => {
			pressed = to;
			return async ({ result, update }) => {
				if (result.type !== 'success') pressed = null;
				await update();
			};
		};
	}
</script>

<li data-row use:listCursor={here}>
	<!--
		The card a task is drawn on — `RowCard`: this period's settling where a
		task has its tick, the name beside it, the verbs along the foot. The
		history unfolds under the whole card.
	-->
	<div class="row-card">
		<RowCard>
			{#snippet rail()}
				{#if !bill.active}
					<!-- Put away: nothing is owed any more, so nothing to pay or skip. -->
					<span class="-m-1 flex shrink-0 self-start p-1 pointer-coarse:w-11" aria-hidden="true">
						<span class="size-7 border border-dashed border-gray-300"></span>
					</span>
				{:else if shownPaid || shownSkipped}
					<form
						method="post"
						action={shownPaid ? actions.unpay : actions.unskip}
						use:enhance={flips({ paid: false, skipped: false })}
					>
						<input type="hidden" name="id" value={bill.id} />
						<input type="hidden" name="period" value={period} />
						<button
							class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
							title={shownPaid
								? t('finance.bills.undoThisPeriodSPayment')
								: t('finance.bills.undoThisPeriodSSkip')}
							aria-label={shownPaid
								? t('finance.bills.undoThePaymentFor', { name: bill.name })
								: t('finance.bills.undoTheSkipFor', { name: bill.name })}
						>
							<span
								class="flex size-7 items-center justify-center border border-gray-400 bg-gray-400 text-white"
							>
								<Icon name={shownPaid ? 'check' : 'skip'} size={14} />
							</span>
						</button>
					</form>
				{:else}
					<button
						type="button"
						class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
						title={t('finance.bills.markPaid')}
						aria-label={t('finance.bills.markPaid2', { name: bill.name })}
						aria-pressed={paying}
						onclick={() => (paying = !paying)}
					>
						<span
							class="flex size-7 items-center justify-center border border-gray-400 bg-white {paying
								? 'text-gray-500'
								: 'text-transparent'}"
						>
							<Icon name="check" size={14} />
						</span>
					</button>
				{/if}
			{/snippet}

			{#snippet controls()}
				{#if bill.active && !shownPaid && !shownSkipped && !paying}
					<form
						method="post"
						action={actions.skip}
						use:enhance={flips({ paid: false, skipped: true })}
					>
						<input type="hidden" name="id" value={bill.id} />
						<input type="hidden" name="period" value={period} />
						<button
							class="icon-btn"
							title={t('finance.bills.skipThisPeriod')}
							aria-label={t('finance.bills.skipName', { name: bill.name })}
						>
							<Icon name="skip" />
						</button>
					</form>
					<!--
							And the other way to pay one: point at the line that did it.

							The tick is somebody saying a bill was paid; this is the bank
							saying so, and the amount comes from the statement rather than
							from what was expected. Both are real — cash, a transfer that has
							not landed, an account this instance does not import — so neither
							replaces the other. Only where the statements are: a notebook is
							not where somebody goes through a bank export.
						-->
					{#if onattach}
						<button
							type="button"
							class="icon-btn"
							title={t('finance.bills.attachThePayment')}
							aria-label={t('finance.bills.attachATransactionTo', { name: bill.name })}
							onclick={() => onattach(bill.id)}
						>
							<Icon name="link" />
						</button>
					{/if}
				{/if}

				<button
					type="button"
					class="icon-btn"
					aria-expanded={expanded}
					aria-controls="bill-history-{bill.id}"
					title={t('finance.bills.historyOf', { name: bill.name })}
					aria-label={t('finance.bills.historyOf', { name: bill.name })}
					data-tour="bill-history"
					onclick={() => (expanded = !expanded)}
				>
					<Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
				</button>

				{#if onedit}
					<button
						type="button"
						class="icon-btn"
						title={t('ui.edit')}
						aria-label={t('finance.bills.edit', { name: bill.name })}
						onclick={() => onedit(bill.id)}
					>
						<Icon name="edit" />
					</button>
				{/if}

				<form data-leaves method="post" action={actions.archive} use:enhance>
					<input type="hidden" name="id" value={bill.id} />
					<input type="hidden" name="archived" value={bill.active ? 'true' : 'false'} />
					{#if bill.active}
						<button
							class="icon-btn"
							title={t('finance.bills.putThisBillAway')}
							aria-label={t('finance.bills.archive', { name: bill.name })}
						>
							<Icon name="archive" />
						</button>
					{:else}
						<button
							class="icon-btn"
							title={t('finance.bills.restore')}
							aria-label={t('finance.bills.restore')}
						>
							<Icon name="undo" />
						</button>
					{/if}
				</form>

				{#if !bill.active && ondelete}
					<button
						type="button"
						class="icon-btn icon-btn-danger"
						title={t('ui.delete')}
						aria-label={t('finance.bills.delete', { name: bill.name })}
						onclick={() => ondelete(bill.id)}
					>
						<Icon name="trash" />
					</button>
				{/if}
			{/snippet}

			{#snippet labels()}
				<!--
					How this period stands, on the line a task's labels sit on: beside
					the verbs where there is the width, so a bill is two lines rather
					than a name, a sentence and a row of buttons on a third.
				-->
				<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
					{#if shownPaid}
						<span class="font-medium text-blue-700">{t('finance.bills.paid')}</span>
					{:else if shownSkipped}
						<span class="font-medium text-gray-600">{t('finance.bills.skipped')}</span>
					{/if}
					{#if bill.automatic}
						<span class="inline-flex items-center gap-1" title={t('finance.bills.automaticTitle')}>
							<Icon name="clock" size={12} />{t('finance.bills.automatic')}
						</span>
					{/if}
					<span>{summaryOf(t, bill, currency)}</span>
				</div>
			{/snippet}

			<p class="text-sm leading-snug font-medium break-words text-gray-900">{bill.name}</p>
		</RowCard>
		{#if paying && bill.active && !shownPaid && !shownSkipped}
			<div class="basis-full pt-1.5">
				<form
					method="post"
					action={actions.pay}
					class="flex items-center gap-1"
					use:enhance={() => {
						// Ticked now; the box comes back only if the payment is refused.
						pressed = { paid: true, skipped: false };
						paying = false;
						return async ({ result, update }) => {
							if (result.type !== 'success') {
								pressed = null;
								paying = true;
							}
							await update();
							if (result.type === 'success') say(t('finance.bills.namePaid', { name: bill.name }));
						};
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
						aria-label={t('finance.bills.amount')}
						onkeydown={(e) => {
							if (e.key === 'Escape') paying = false;
						}}
					/>
					<button class="btn btn-primary btn-sm" type="submit">{t('finance.bills.paid2')}</button>
					<button
						class="icon-btn"
						type="button"
						title={t('ui.cancel')}
						aria-label={t('ui.cancel')}
						onclick={() => (paying = false)}
					>
						<Icon name="close" />
					</button>
				</form>
			</div>
		{/if}
	</div>

	{#if expanded}
		<!-- What it has cost so far: every period settled, and one period's average. -->
		<div id="bill-history-{bill.id}" class="border-t border-gray-100 px-4 pt-2 pb-3 sm:pl-15">
			{#if bill.history.entries.length === 0}
				<EmptyState compact icon="clock" title={t('finance.bills.nothingRecordedYet')} />
			{:else}
				<dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
					<div>
						<dt class="text-xs text-gray-500">
							{t(AVERAGE_LABEL[bill.rhythm] ?? AVERAGE_LABEL.once)}
						</dt>
						<dd class="font-medium text-gray-900 tabular-nums">
							{bill.history.averagePaid === null ? '—' : money(bill.history.averagePaid)}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-gray-500">{t('finance.bills.paidCount')}</dt>
						<dd class="font-medium text-gray-900 tabular-nums">{bill.history.paidCount}</dd>
					</div>
					<div>
						<dt class="text-xs text-gray-500">{t('finance.bills.skippedCount')}</dt>
						<dd class="font-medium text-gray-900 tabular-nums">{bill.history.skippedCount}</dd>
					</div>
					<div>
						<dt class="text-xs text-gray-500">{t('finance.bills.totalPaid')}</dt>
						<dd class="font-medium text-gray-900 tabular-nums">
							{money(bill.history.totalPaid)}
						</dd>
					</div>
				</dl>

				<table class="mt-2 w-full text-sm">
					<thead>
						<tr class="text-left text-xs text-gray-500">
							<th class="py-1 pr-3 font-normal">{t('finance.bills.period')}</th>
							<th class="py-1 pr-3 font-normal">{t('finance.bills.date')}</th>
							<th class="py-1 pr-3 text-right font-normal">{t('finance.bills.amount')}</th>
							<th class="py-1 font-normal"
								><span class="sr-only">{t('finance.bills.paidCount')}</span></th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						{#each bill.history.entries as entry (entry.id)}
							<tr>
								<td class="py-1 pr-3 text-gray-700 tabular-nums">{entry.period}</td>
								<td class="py-1 pr-3 text-gray-600 tabular-nums">{dateOf(entry.paidAt, now())}</td>
								<td class="py-1 pr-3 text-right text-gray-900 tabular-nums">
									{#if entry.status === 'paid'}
										{money(entry.amountPaid)}
										{#if entry.amountPaid !== entry.amountExpected}
											<span class="block text-xs text-gray-500">
												{t('finance.bills.expectedAmountShort', {
													amount: money(entry.amountExpected)
												})}
											</span>
										{/if}
									{:else}
										—
									{/if}
								</td>
								<td class="py-1 text-xs text-gray-600">
									{entry.status === 'paid' ? t('finance.bills.paid') : t('finance.bills.skipped')}
									{#if entry.automatic}
										· {t('finance.bills.automatic').toLowerCase()}
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}
</li>
