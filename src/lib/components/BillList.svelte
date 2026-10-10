<script lang="ts">
	import { openFromUrl } from '$lib/open-from-url.svelte';
	/**
	 * Bills, with everything that can be done to them.
	 *
	 * The Finance room and a notebook's Bills tab both show bills, and the tab
	 * drew the rows without the room's form — so a bill filed under a subject
	 * could be paid and put away but not edited, and an archived one could not
	 * be deleted at all. The rows, the new-and-edit form and the delete
	 * confirmation are one thing now, drawn here for both screens; what each
	 * screen posts to is `actions` (`$lib/bill-action-names`).
	 *
	 * `openNew()` is how a screen's own New button opens the form.
	 */
	import type { Snippet } from 'svelte';
	import BillRow from '$lib/components/BillRow.svelte';
	import BillFields from '$lib/components/fields/BillFields.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import { enhance } from '$lib/enhance';
	import type { BillActionNames } from '$lib/bill-action-names';
	import type { Currency } from '$lib/money';
	import type { ComponentProps } from 'svelte';
	import { useT } from '$lib/i18n';
	import { useWhen } from '$lib/when-context.svelte';
	import { dayStamp } from '$lib/when';
	import { asDecimal } from '$lib/bill-summary';

	const t = useT();
	const now = useWhen();

	type Listed = ComponentProps<typeof BillRow>['bill'] & {
		currency?: string | null;
		notebookId: number | null;
		period: string;
		paidThisPeriod: boolean;
		skippedThisPeriod: boolean;
	};

	let {
		bills,
		currency,
		actions,
		notebooks = [],
		/** The notebook a bill written from inside one belongs to. */
		startingNotebook = null,
		onattach,
		/** What to show when there is nothing active and nothing put away. */
		empty,
		/** Whether the archived bills are listed under the active ones. */
		showArchived = $bindable(false),
		/**
		 * Draw its own disclosure for the archived bills. Off where the screen
		 * has a filter strip that carries the toggle instead.
		 */
		archiveToggle = true,
		/**
		 * Where j/k stands, counting the active bills and then the archived
		 * ones that are showing. -1 for nowhere, and nowhere by default.
		 */
		cursor = -1
	}: {
		bills: Listed[];
		currency: Currency;
		actions: BillActionNames;
		notebooks?: { id: number; title: string; modules: readonly string[] }[];
		startingNotebook?: number | null;
		onattach?: (id: number) => void;
		empty?: Snippet;
		showArchived?: boolean;
		archiveToggle?: boolean;
		cursor?: number;
	} = $props();

	const active = $derived(bills.filter((b) => b.active));
	const archived = $derived(bills.filter((b) => !b.active));

	// The form does both jobs: no editing id is a new bill, an id is that bill
	// being changed — one form, so the two can never drift apart.
	let showForm = $state(false);
	let editingId = $state<number | null>(null);
	const editing = $derived(bills.find((b) => b.id === editingId) ?? null);
	/** Which rhythm the open form is on, so its due-day field asks the right thing. */
	let formRhythm = $state('monthly');
	/** Bumped per opening, so the fields mount fresh rather than keeping the last bill. */
	let formKey = $state(0);
	let formError = $state<string | null>(null);

	let confirmingDeleteId = $state<number | null>(null);
	const confirmingDelete = $derived(bills.find((b) => b.id === confirmingDeleteId) ?? null);
	let editingPayment = $state<{
		billId: number;
		id: number;
		period: string;
		amountPaid: number;
		paidAt: string;
		movementId: number | null;
	} | null>(null);
	let paymentError = $state<string | null>(null);

	export function openNew() {
		editingId = null;
		formRhythm = 'monthly';
		formError = null;
		formKey++;
		showForm = true;
	}

	// `?edit=<id>` opens its editor: how a notification or a receipt leads here (`$lib/object-links`).
	openFromUrl((id) => {
		if (bills.some((one) => one.id === id)) openEdit(id);
	});

	export function openEdit(id: number) {
		editingId = id;
		formRhythm = bills.find((b) => b.id === id)?.rhythm ?? 'monthly';
		formError = null;
		formKey++;
		showForm = true;
	}

	const uid = $props.id();
	const formId = `bill-form-${uid}`;
	const paymentFormId = `bill-payment-form-${uid}`;
</script>

{#snippet row(bill: Listed, at: number)}
	<BillRow
		here={at === cursor}
		{bill}
		{currency}
		{actions}
		period={bill.period}
		paid={bill.paidThisPeriod}
		skipped={bill.skippedThisPeriod}
		onedit={openEdit}
		ondelete={(id) => (confirmingDeleteId = id)}
		oneditpayment={(billId, entry) => {
			editingPayment = { billId, ...entry };
			paymentError = null;
		}}
		{onattach}
	/>
{/snippet}

{#if active.length === 0 && archived.length === 0}
	{@render empty?.()}
{:else}
	<div class={archiveToggle ? 'space-y-3' : ''}>
		{#if active.length === 0}
			{@render empty?.()}
		{:else}
			<ul class="divide-y divide-gray-200" data-tour="bill-list">
				{#each active as bill, i (bill.id)}{@render row(bill, i)}{/each}
			</ul>
		{/if}

		{#if archived.length > 0 && archiveToggle}
			<div>
				<button
					type="button"
					class="inline-flex items-center gap-1 px-4 text-sm text-gray-500 hover:text-gray-700"
					aria-expanded={showArchived}
					onclick={() => (showArchived = !showArchived)}
				>
					<Icon name={showArchived ? 'chevron-down' : 'chevron-right'} />
					{t('finance.bills.archived', { length: archived.length })}
				</button>
				{#if showArchived}
					<ul class="mt-2 divide-y divide-gray-200 border-t border-gray-200">
						{#each archived as bill, i (bill.id)}{@render row(bill, active.length + i)}{/each}
					</ul>
				{/if}
			</div>
		{:else if archived.length > 0 && showArchived}
			<ul class="divide-y divide-gray-200 border-t border-gray-200">
				{#each archived as bill, i (bill.id)}{@render row(bill, active.length + i)}{/each}
			</ul>
		{/if}
	</div>
{/if}

<!-- New / edit, one form. -->
<Modal
	bind:open={showForm}
	error={formError}
	title={editing ? t('finance.bills.editBill') : t('finance.bills.newBill')}
	onclose={() => (editingId = null)}
	size="sm"
>
	<form
		id={formId}
		method="post"
		action={editing ? actions.update : actions.create}
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'failure')
					formError = String((result.data as { message?: unknown } | undefined)?.message ?? '');
				if (result.type === 'success') {
					showForm = false;
					editingId = null;
				}
			}}
	>
		{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
		{#key formKey}
			<BillFields {editing} bind:rhythm={formRhythm} {notebooks} {startingNotebook} />
		{/key}
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form={formId}>
			{editing ? t('ui.save') : t('ui.add')}
		</button>
	{/snippet}
</Modal>

<Modal
	open={editingPayment !== null}
	title={t('finance.bills.editPayment')}
	description={bills.find((bill) => bill.id === editingPayment?.billId)?.name ?? ''}
	error={paymentError}
	onclose={() => (editingPayment = null)}
	size="sm"
>
	{#if editingPayment}
		{#key editingPayment.id}
			<form
				id={paymentFormId}
				method="post"
				action={actions.editPayment}
				use:enhance={() =>
					async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'failure')
							paymentError = String(
								(result.data as { message?: unknown } | undefined)?.message ?? ''
							);
						if (result.type === 'success') editingPayment = null;
					}}
			>
				<input type="hidden" name="id" value={editingPayment.billId} />
				<input type="hidden" name="paymentId" value={editingPayment.id} />
				<FormGrid>
					<Field label={t('finance.bills.date')} span={6} required>
						<input
							type="date"
							name="paidDate"
							value={dayStamp(editingPayment.paidAt, now())}
							required
							class="input"
						/>
					</Field>
					<Field
						label={t('finance.bills.amount')}
						span={6}
						required
						hint={editingPayment.movementId !== null
							? t('finance.bills.changingAmountDetachesMovement')
							: undefined}
					>
						<input
							name="amount"
							inputmode="decimal"
							value={asDecimal(editingPayment.amountPaid)}
							required
							class="input"
						/>
					</Field>
				</FormGrid>
			</form>
		{/key}
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editingPayment = null)}
			>{t('ui.cancel')}</button
		>
		<button type="submit" form={paymentFormId} class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<!-- Hard delete, only from the archived list, confirmed in its own dialog so
     the confirm button is never where the delete button was. -->
<Modal
	open={confirmingDelete !== null}
	title={t('finance.bills.deleteThisBill')}
	onclose={() => (confirmingDeleteId = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.name}</strong>
			{t('finance.bills.andItsWholePaymentHistory')}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDeleteId = null)}
			>{t('finance.bills.keepIt')}</button
		>
		<form
			method="post"
			action={actions.remove}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingDeleteId = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>
