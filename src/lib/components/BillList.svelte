<script lang="ts">
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
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import { enhance } from '$lib/enhance';
	import type { BillActionNames } from '$lib/bill-action-names';
	import type { Currency } from '$lib/money';
	import type { ComponentProps } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

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
		empty
	}: {
		bills: Listed[];
		currency: Currency;
		actions: BillActionNames;
		notebooks?: { id: number; title: string }[];
		startingNotebook?: number | null;
		onattach?: (id: number) => void;
		empty?: Snippet;
	} = $props();

	const active = $derived(bills.filter((b) => b.active));
	const archived = $derived(bills.filter((b) => !b.active));

	let showArchived = $state(false);

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

	export function openNew() {
		editingId = null;
		formRhythm = 'monthly';
		formError = null;
		formKey++;
		showForm = true;
	}

	function openEdit(id: number) {
		editingId = id;
		formRhythm = bills.find((b) => b.id === id)?.rhythm ?? 'monthly';
		formError = null;
		formKey++;
		showForm = true;
	}

	const uid = $props.id();
	const formId = `bill-form-${uid}`;
</script>

{#snippet row(bill: Listed)}
	<BillRow
		{bill}
		{currency}
		{actions}
		period={bill.period}
		paid={bill.paidThisPeriod}
		skipped={bill.skippedThisPeriod}
		onedit={openEdit}
		ondelete={(id) => (confirmingDeleteId = id)}
		{onattach}
	/>
{/snippet}

{#if active.length === 0 && archived.length === 0}
	{@render empty?.()}
{:else}
	<div class="space-y-3">
		{#if active.length === 0}
			{@render empty?.()}
		{:else}
			<ul class="divide-y divide-gray-200" data-tour="bill-list">
				{#each active as bill (bill.id)}{@render row(bill)}{/each}
			</ul>
		{/if}

		{#if archived.length > 0}
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
						{#each archived as bill (bill.id)}{@render row(bill)}{/each}
					</ul>
				{/if}
			</div>
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
