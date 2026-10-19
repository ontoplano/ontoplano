<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { typing } from '$lib/browse.svelte';
	import { getAction } from '$lib/shortcuts';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { formatMoney, moneyInput } from '$lib/money';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	const t = useT();
	const KINDS = ['custody', 'payable', 'receivable', 'reserve'] as const;
	const label = (kind: (typeof KINDS)[number]) => t(`finance.commitments.${kind}` as PlainKey);
	let creating = $state(false);
	let editing = $state(false);
	let formCurrency = $state('KES');
	let confirming = $state<{
		action: 'delete' | 'close' | 'deleteEntry';
		id: number;
		permanent?: boolean;
	} | null>(null);
	let settling = $state(false);
	let paymentId = $state('');
	const selected = $derived(data.selected);
	const visible = $derived(
		data.commitments.filter((stock) =>
			data.archived ? stock.status !== 'open' : stock.status === 'open'
		)
	);
	const candidates = $derived(
		data.movements.filter(
			(line) =>
				selected &&
				line.currency === selected.currency &&
				(selected.kind === 'receivable' ? line.amountCents > 0 : line.amountCents < 0)
		)
	);
	const payment = $derived(candidates.find((line) => line.id === Number(paymentId)));
	const money = (amount: number, currency: string) => formatMoney(amount, currency);

	function openNew() {
		formCurrency = data.currency;
		creating = true;
		editing = false;
	}
	function openEdit() {
		if (!selected) return;
		formCurrency = selected.currency;
		editing = true;
		creating = false;
	}
	function onkeydown(event: KeyboardEvent) {
		if (typing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
		if (getAction('/finance/commitments', event) === 'new') {
			event.preventDefault();
			openNew();
		}
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{t('rooms.finance.tabs.commitments')}</title></svelte:head>
<RoomSurface>
	<div class="space-y-5 p-4" data-tour="commitments">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h1 class="text-xl font-semibold">{t('rooms.finance.tabs.commitments')}</h1>
			<div class="flex flex-wrap gap-2">
				<a
					class="btn"
					href={resolve(data.archived ? '/finance/commitments' : '/finance/commitments?archived=1')}
					>{data.archived ? t('finance.commitments.current') : t('finance.commitments.archived')}</a
				>
				<button class="btn btn-primary" type="button" onclick={openNew}
					>{t('finance.commitments.new')}</button
				>
			</div>
		</div>
		<FormError message={form?.message} />
		<p class="text-sm text-gray-600">{t('finance.commitments.hint')}</p>
		<div class="grid gap-4 md:grid-cols-2" data-tour="commitment-kinds">
			{#each KINDS as kind (kind)}
				<section class="space-y-2 rounded border border-gray-200 p-4" aria-label={label(kind)}>
					<h2 class="font-semibold">{label(kind)}</h2>
					<p class="text-sm text-gray-600">{t(`finance.commitments.${kind}Hint` as PlainKey)}</p>
					{#each [...new Set(visible
								.filter((stock) => stock.kind === kind)
								.map((stock) => stock.currency))] as currency (currency)}
						<h3 class="text-sm font-semibold">{currency}</h3>
						{#each visible.filter((stock) => stock.kind === kind && stock.currency === currency) as stock (stock.id)}
							<article class="rounded border border-gray-200 p-3 text-sm" data-testid="commitment">
								<a
									class="link font-semibold"
									href={resolve(
										`/finance/commitments?commitment=${stock.id}${data.archived ? '&archived=1' : ''}`
									)}>{stock.name}</a
								>
								<p>
									{stock.currency} · <strong>{money(stock.balanceMinor, stock.currency)}</strong> · {t(
										`finance.commitments.status.${stock.status}` as PlainKey
									)}
								</p>
								{#if stock.personName}<p>{stock.personName}</p>{/if}
								{#if stock.lastEntryOn}<p>
										{t('finance.commitments.lastEntry')}
										{stock.lastEntryOn}
									</p>{/if}
							</article>
						{/each}
					{/each}
				</section>
			{/each}
		</div>
		{#if selected}
			<section
				class="space-y-4 rounded border border-gray-200 p-4"
				aria-label={t('finance.commitments.history')}
				data-testid="commitment-history"
				data-tour="commitment-history"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="font-semibold">
						{selected.name} · {selected.currency} · {money(
							selected.balanceMinor,
							selected.currency
						)}
					</h2>
					<button class="btn" type="button" onclick={openEdit}>{t('ui.edit')}</button>
				</div>
				{#if selected.notes}<p class="text-sm whitespace-pre-wrap">{selected.notes}</p>{/if}
				<p class="text-sm">
					{t('finance.commitments.opening')}: {money(selected.openingMinor, selected.currency)}
				</p>
				<ol class="space-y-2">
					{#each data.entries as entry (entry.id)}
						<li
							class="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-2 text-sm"
							data-testid="commitment-entry"
						>
							<div>
								<p>
									{entry.occurredOn} · {money(entry.amountMinor, selected.currency)} · {t(
										'finance.commitments.running'
									)}: {money(entry.balanceMinor, selected.currency)}
								</p>
								<p>{entry.note ?? ''}</p>
								{#if entry.transactionId}<a class="link" href={resolve('/finance/ledgers')}
										>{t('finance.commitments.movement')} #{entry.transactionId}</a
									>{/if}
							</div>
							<button
								class="btn"
								type="button"
								onclick={() => (confirming = { action: 'deleteEntry', id: entry.id })}
								>{t('finance.commitments.reverseEntry')}</button
							>
						</li>
					{/each}
				</ol>
				<div class="flex flex-wrap gap-2">
					<form method="post" action="?/archive" use:enhance>
						<input type="hidden" name="id" value={selected.id} /><input
							type="hidden"
							name="archived"
							value={selected.status === 'open' ? 'true' : 'false'}
						/><button class="btn" type="submit"
							>{selected.status === 'open'
								? t('finance.commitments.archive')
								: t('finance.commitments.reopen')}</button
						>
					</form>
					{#if selected.status === 'open'}
						<button
							class="btn"
							type="button"
							onclick={() => {
								paymentId = '';
								settling = true;
							}}
							>{selected.kind === 'reserve'
								? t('finance.commitments.consume')
								: t('finance.commitments.settle')}</button
						>
						<button
							class="btn"
							type="button"
							onclick={() => (confirming = { action: 'close', id: selected.id })}
							>{t('finance.commitments.close')}</button
						>
					{/if}
					<button
						class="btn btn-danger"
						type="button"
						onclick={() =>
							(confirming = {
								action: 'delete',
								id: selected.id,
								permanent: data.archived && selected.status === 'archived'
							})}
						>{data.archived && selected.status === 'archived'
							? t('finance.commitments.deletePermanently')
							: t('ui.delete')}</button
					>
				</div>
				{#if selected.status === 'open'}
					<form
						method="post"
						action="?/addEntry"
						use:enhance
						class="grid gap-3 border-t border-gray-200 pt-3 sm:grid-cols-2"
						aria-label={t('finance.commitments.adjustment')}
					>
						<input type="hidden" name="commitmentId" value={selected.id} />
						<label class="text-sm"
							>{t('finance.ledgers.day')}<input
								type="date"
								name="occurredOn"
								value={data.today}
								class="input mt-1 w-full"
								required
							/></label
						>
						<label class="text-sm"
							>{t('ui.amount')} ({selected.currency})<input
								name="amount"
								inputmode="decimal"
								class="input mt-1 w-full"
								required
							/></label
						>
						<label class="text-sm sm:col-span-2"
							>{t('ui.notes')}<OneLine
								name="note"
								class="input mt-1 w-full"
								maxlength={2000}
							/></label
						>
						<p class="text-sm text-gray-600">{t('finance.commitments.adjustmentHint')}</p>
						<button class="btn self-end" type="submit">{t('finance.commitments.addEntry')}</button>
					</form>
				{/if}
			</section>
		{/if}
	</div>
</RoomSurface>

<Modal
	open={creating || editing}
	error={form?.message}
	title={editing ? t('finance.commitments.edit') : t('finance.commitments.new')}
	onclose={() => {
		creating = false;
		editing = false;
	}}
	size="sm"
>
	{#if creating || editing}
		<form
			id="commitment-form"
			method="post"
			action={editing ? '?/update' : '?/create'}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') {
						creating = false;
						editing = false;
					}
					return update();
				}}
			class="space-y-3"
		>
			{#if editing}<input type="hidden" name="id" value={selected?.id} />{/if}
			<label class="block text-sm"
				>{t('ui.name')}<OneLine
					name="heading"
					value={editing ? (selected?.name ?? '') : ''}
					required
					maxlength={200}
					class="input mt-1 w-full"
				/></label
			>
			<label class="block text-sm"
				>{t('finance.ledgers.meaning')}<select
					name="kind"
					value={editing ? selected?.kind : 'custody'}
					class="select mt-1 w-full"
					>{#each KINDS as kind (kind)}<option value={kind}>{label(kind)}</option>{/each}</select
				></label
			>
			<label class="block text-sm"
				>{t('finance.commitments.currency')}<OneLine
					name="currency"
					bind:value={formCurrency}
					required
					maxlength={3}
					class="input mt-1 w-full"
				/></label
			>
			<label class="block text-sm"
				>{t('finance.commitments.opening')} ({formCurrency})<input
					name="openingAmount"
					inputmode="decimal"
					value={moneyInput(editing ? (selected?.openingMinor ?? 0) : 0, formCurrency)}
					required
					class="input mt-1 w-full"
				/></label
			>
			<label class="block text-sm"
				>{t('finance.commitments.person')}<select
					name="personId"
					value={editing ? (selected?.personId ?? '') : ''}
					class="select mt-1 w-full"
					><option value="">—</option>{#each data.people as person (person.id)}<option
							value={person.id}>{person.name}</option
						>{/each}</select
				></label
			>
			<label class="block text-sm"
				>{t('ui.notes')}<textarea
					name="notes"
					class="textarea mt-1 w-full"
					maxlength={2000}
					value={editing ? (selected?.notes ?? '') : ''}
				></textarea></label
			>
		</form>
	{/if}
	{#snippet footer()}<button
			class="btn"
			type="button"
			onclick={() => {
				creating = false;
				editing = false;
			}}>{t('ui.cancel')}</button
		><button class="btn btn-primary" type="submit" form="commitment-form"
			>{editing ? t('ui.save') : t('ui.create')}</button
		>{/snippet}
</Modal>

<Modal
	open={confirming !== null}
	error={form?.message}
	title={confirming?.action === 'close'
		? t('finance.commitments.close')
		: confirming?.action === 'deleteEntry'
			? t('finance.commitments.reverseEntry')
			: t('ui.delete')}
	onclose={() => (confirming = null)}
	size="sm"
>
	{#if confirming}
		<form
			id="commitment-confirm"
			method="post"
			action={`?/${confirming.action}`}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success' || result.type === 'redirect') confirming = null;
					return update();
				}}
			class="space-y-3"
		>
			<input type="hidden" name="id" value={confirming.id} /><input
				type="hidden"
				name="permanent"
				value={confirming.permanent ? 'true' : 'false'}
			/>
			<p class="text-sm">
				{confirming.action === 'close'
					? t('finance.commitments.closeHint')
					: confirming.action === 'deleteEntry'
						? t('finance.commitments.reverseHint')
						: t('finance.commitments.deleteHint')}
			</p>
			{#if confirming.action === 'close' && selected?.balanceMinor}<p class="text-sm font-medium">
					{money(selected.balanceMinor, selected.currency)}
				</p>
				<label class="block text-sm"
					>{t('finance.commitments.writeOffNote')}<OneLine
						name="writeOffNote"
						required
						maxlength={2000}
						class="input mt-1 w-full"
					/></label
				>{/if}
		</form>
	{/if}
	{#snippet footer()}<button class="btn" type="button" onclick={() => (confirming = null)}
			>{t('ui.cancel')}</button
		><button class="btn btn-danger" type="submit" form="commitment-confirm" use:armed
			>{t('ui.confirm')}</button
		>{/snippet}
</Modal>

<Modal
	open={settling}
	error={form?.message}
	title={selected?.kind === 'reserve'
		? t('finance.commitments.consume')
		: t('finance.commitments.settle')}
	onclose={() => (settling = false)}
	size="sm"
>
	{#if settling && selected}
		<form
			id="commitment-settle"
			method="post"
			action={selected.kind === 'reserve' ? '?/consume' : '?/settle'}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') settling = false;
					return update();
				}}
			class="space-y-3"
		>
			<input type="hidden" name="commitmentId" value={selected.id} />
			<label class="block text-sm"
				>{t('finance.commitments.movement')}<select
					name="transactionId"
					bind:value={paymentId}
					required
					class="select mt-1 w-full"
					><option value="">—</option>{#each candidates as line (line.id)}<option value={line.id}
							>{line.occurredOn} · {money(line.amountCents, selected.currency)} · {line.description}</option
						>{/each}</select
				></label
			>
			{#if payment}<p class="text-sm font-medium">
					{money(selected.balanceMinor, selected.currency)} · {t('finance.commitments.after')}: {money(
						selected.balanceMinor - Math.abs(payment.amountCents),
						selected.currency
					)}
				</p>{/if}
			<p class="text-sm">
				{selected.kind === 'reserve'
					? t('finance.commitments.consumeHint')
					: t('finance.commitments.settleHint')}
			</p>
			<label class="block text-sm"
				>{t('ui.notes')}<OneLine name="note" maxlength={2000} class="input mt-1 w-full" /></label
			>
		</form>
	{/if}
	{#snippet footer()}<button class="btn" type="button" onclick={() => (settling = false)}
			>{t('ui.cancel')}</button
		><button
			class="btn btn-primary"
			type="submit"
			form="commitment-settle"
			disabled={!payment}
			use:armed>{t('ui.confirm')}</button
		>{/snippet}
</Modal>
