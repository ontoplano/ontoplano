<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import OneLine from '$lib/components/OneLine.svelte';
	import { formatMoney, moneyInput, parseSignedMoney } from '$lib/money';
	import { useT } from '$lib/i18n';
	import type { Movement } from '$lib/services/statements';
	import type { Commitment } from '$lib/services/commitments';

	let {
		movement,
		currency,
		commitments
	}: { movement: Movement; currency: string | null; commitments: Commitment[] } = $props();
	const t = useT();
	let nextKey = 2;
	let parts = $state([
		{ key: 0, kind: 'personal', amount: '', category: '', commitmentId: '', note: '' },
		{ key: 1, kind: 'custody', amount: '', category: '', commitmentId: '', note: '' }
	]);
	let confirming = $state(false);
	const choices = $derived(
		commitments.filter(
			(stock) => stock.currency === currency && ['custody', 'payable'].includes(stock.kind)
		)
	);
	const difference = $derived.by(() => {
		let sum = 0;
		for (const part of parts) {
			const amount = parseSignedMoney(part.amount, currency);
			if (amount === null || !Number.isSafeInteger(sum + amount)) return null;
			sum += amount;
		}
		const value = movement.amountCents - sum;
		return Number.isSafeInteger(value) ? value : null;
	});
	const money = (value: number) =>
		currency
			? formatMoney(value, currency)
			: t('finance.ledgers.minorUnitsAmount', { amount: value });
</script>

<section
	class="mt-4 space-y-3 border-t border-gray-200 pt-3"
	aria-label={t('finance.splits.title')}
	data-testid="movement-split"
>
	<h3 class="font-medium">{t('finance.splits.title')}</h3>
	<p class="text-sm text-gray-600">{t('finance.splits.hint')}</p>
	{#if movement.allocations.length}
		<ul class="space-y-2 text-sm">
			{#each movement.allocations as part (part.id)}
				<li>
					<strong
						>{part.kind === 'personal'
							? t('finance.splits.personal')
							: t('finance.splits.custody')}</strong
					>
					{money(part.amountMinor)}
					{part.category ?? ''}
					{part.note ?? ''}
					{#if part.commitmentId}
						<a class="link" href={resolve(`/finance/commitments?commitment=${part.commitmentId}`)}
							>{t('finance.splits.history')}</a
						>
					{/if}
				</li>
			{/each}
		</ul>
		{#if confirming}
			<form method="post" action="?/unsplitMovement" use:enhance>
				<input type="hidden" name="id" value={movement.id} />
				<p class="mb-2 text-sm">{t('finance.splits.confirmUnsplit')}</p>
				<button class="btn" type="button" onclick={() => (confirming = false)}
					>{t('ui.cancel')}</button
				>
				<button class="btn btn-danger" type="submit" use:armed>{t('finance.splits.unsplit')}</button
				>
			</form>
		{:else}
			<button class="btn" type="button" onclick={() => (confirming = true)}
				>{t('finance.splits.unsplit')}</button
			>
		{/if}
	{:else if movement.commitmentEntryId}
		<p class="text-sm text-gray-600">{t('finance.splits.linkedHint')}</p>
	{:else}
		<form method="post" action="?/splitMovement" use:enhance class="space-y-3">
			<input type="hidden" name="id" value={movement.id} />
			{#each parts as part (part.key)}
				<fieldset class="grid gap-2 rounded border border-gray-200 p-3 sm:grid-cols-2">
					<label class="text-sm"
						>{t('finance.ledgers.meaning')}
						<select name="partKind" bind:value={part.kind} class="select mt-1 w-full">
							<option value="personal">{t('finance.splits.personal')}</option>
							<option value="custody">{t('finance.splits.custody')}</option>
						</select>
					</label>
					<label class="text-sm"
						>{t('ui.amount')} ({currency ?? t('finance.ledgers.minorUnitsAmount', { amount: '' })})
						<input
							name="amount"
							inputmode="decimal"
							bind:value={part.amount}
							placeholder={moneyInput(movement.amountCents, currency)}
							class="input mt-1 w-full"
							required
						/>
					</label>
					<label class="text-sm"
						>{t('finance.splits.category')}
						<OneLine
							name="partCategory"
							bind:value={part.category}
							class="input mt-1 w-full"
							disabled={part.kind !== 'personal'}
							maxlength={100}
						/>
					</label>
					<label class="text-sm"
						>{t('finance.splits.commitment')}
						<select
							name="partCommitmentId"
							bind:value={part.commitmentId}
							class="select mt-1 w-full"
							disabled={part.kind !== 'custody'}
							required={part.kind === 'custody'}
						>
							<option value="">—</option>
							{#each choices as stock (stock.id)}<option value={stock.id}
									>{stock.name} · {money(stock.balanceMinor)}</option
								>{/each}
						</select>
					</label>
					<input
						type="hidden"
						name="partData"
						value={JSON.stringify({
							kind: part.kind,
							amount: part.amount,
							category: part.kind === 'personal' ? part.category : '',
							commitmentId: part.kind === 'custody' ? part.commitmentId : null,
							note: part.note
						})}
					/>
					<label class="text-sm"
						>{t('ui.notes')}<OneLine
							name="partNote"
							bind:value={part.note}
							class="input mt-1 w-full"
							maxlength={2000}
						/></label
					>
					<button
						class="btn self-end"
						type="button"
						disabled={parts.length === 1}
						onclick={() => (parts = parts.filter((row) => row.key !== part.key))}
						>{t('finance.splits.removePart')}</button
					>
				</fieldset>
			{/each}
			<p class="text-sm" role="status">
				{t('finance.splits.difference', { amount: difference === null ? '—' : money(difference) })}
			</p>
			<div class="flex flex-wrap gap-2">
				<button
					class="btn"
					type="button"
					disabled={parts.length >= 100}
					onclick={() =>
						(parts = [
							...parts,
							{
								key: nextKey++,
								kind: 'personal',
								amount: '',
								category: '',
								commitmentId: '',
								note: ''
							}
						])}>{t('finance.splits.addPart')}</button
				>
				<button class="btn btn-primary" type="submit" disabled={difference !== 0}
					>{t('finance.splits.save')}</button
				>
			</div>
		</form>
	{/if}
</section>
