<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const currency = $derived(data.currency as Currency);
	const money = (cents: number) => formatMoney(cents, currency);

	let statementText = $state('');
	let showPaste = $state(false);
	let importForm: HTMLFormElement | undefined = $state();

	/**
	 * Choosing the file is the submit: it is read in the browser and posted
	 * as text, which is also what lets a self-contained instance import with
	 * no server anywhere.
	 */
	async function fileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		statementText = await file.text();
		input.value = '';
		importForm?.requestSubmit();
	}

	const categories = $derived(data.rules.filter((r) => r.kind === 'category'));
	const tags = $derived(data.rules.filter((r) => r.kind === 'tag'));

	const dayOf = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
</script>

<div class="space-y-5">
	<!-- The import itself. -->
	<section class="rounded border border-gray-200 p-4">
		<h2 class="mb-3 text-sm font-semibold text-gray-900">Import a bank export</h2>
		<form
			method="post"
			action="?/import"
			bind:this={importForm}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') statementText = '';
					return update({ reset: false });
				}}
		>
			<FormError message={form?.message} />
			<div class="flex flex-wrap items-end gap-3">
				<label class="block text-sm">
					<span class="text-gray-600">Export</span>
					<select name="source" class="input mt-1 block">
						{#each data.parsers as p (p.key)}
							<option value={p.key}>{p.name}</option>
						{/each}
					</select>
				</label>
				<label class="flex items-center gap-2 pb-2 text-sm text-gray-700">
					<input type="checkbox" name="flip" />
					Flip amounts
				</label>
				<label class="btn btn-sm cursor-pointer">
					<Icon name="plus" /> Choose the file
					<input
						type="file"
						accept=".csv,text/csv,text/plain"
						class="hidden"
						onchange={fileChosen}
					/>
				</label>
				<button
					type="button"
					class="text-sm text-gray-500 hover:text-gray-700"
					onclick={() => (showPaste = !showPaste)}
				>
					or paste it
				</button>
			</div>
			<textarea
				name="text"
				bind:value={statementText}
				rows="6"
				class="input mt-3 w-full font-mono text-xs {showPaste || statementText ? '' : 'hidden'}"
				placeholder="Data,Valor,Identificador,Descrição"
			></textarea>
			{#if showPaste || statementText}
				<div class="mt-2">
					<button class="btn btn-primary btn-sm" type="submit">Import</button>
				</div>
			{/if}
			{#if form && 'added' in form && form.success}
				<p class="mt-2 text-sm text-gray-600">
					{form.added} added, {form.skipped} already here.
				</p>
			{/if}
		</form>
	</section>

	<!-- The rules that sort what arrives. -->
	<section class="rounded border border-gray-200 p-4">
		<h2 class="mb-1 text-sm font-semibold text-gray-900">Sorting rules</h2>
		<p class="mb-3 text-xs text-gray-500">
			A line whose description matches the pattern belongs. Categories are a partition — the first
			match wins, so month totals add up. Tags overlap freely.
		</p>

		<div class="grid gap-4 sm:grid-cols-2">
			{#each [{ kind: 'category', title: 'Categories', rules: categories }, { kind: 'tag', title: 'Tags', rules: tags }] as group (group.kind)}
				<div>
					<h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
						{group.title}
					</h3>
					<ul class="space-y-1">
						{#each group.rules as rule (rule.id)}
							<li class="flex items-center gap-2 text-sm">
								<span class="font-medium text-gray-900">{rule.name}</span>
								<code class="min-w-0 flex-1 truncate text-xs text-gray-500">/{rule.pattern}/i</code>
								{#if group.kind === 'category'}
									<form method="post" action="?/updateRule" use:enhance>
										<input type="hidden" name="id" value={rule.id} />
										<input type="hidden" name="position" value={Math.max(0, rule.position - 1)} />
										<button class="icon-btn" aria-label="Move {rule.name} up" title="Earlier wins">
											<Icon name="chevron-up" />
										</button>
									</form>
								{/if}
								<form method="post" action="?/deleteRule" use:enhance>
									<input type="hidden" name="id" value={rule.id} />
									<button class="icon-btn" aria-label="Delete the rule {rule.name}" use:armed>
										<Icon name="trash" />
									</button>
								</form>
							</li>
						{/each}
					</ul>
					<form method="post" action="?/createRule" class="mt-2 flex items-end gap-2" use:enhance>
						<input type="hidden" name="kind" value={group.kind} />
						<label class="block flex-1 text-sm">
							<OneLine
								name="heading"
								placeholder={group.kind === 'category' ? 'Groceries' : 'healthy'}
								class="input w-full"
								required
							/>
						</label>
						<label class="block flex-1 text-sm">
							<OneLine
								name="pattern"
								placeholder={group.kind === 'category' ? 'mercado|hortifruti' : 'gym|salad'}
								class="input w-full font-mono text-xs"
								required
							/>
						</label>
						<button class="btn btn-sm" type="submit">Add</button>
					</form>
				</div>
			{/each}
		</div>
	</section>

	<!-- What the statements hold. -->
	{#if data.movements.length === 0}
		<EmptyState
			icon="wallet"
			title="No statement lines yet"
			description="Import an export above and its lines land here, sorted by your rules."
		/>
	{:else}
		<div class="overflow-x-auto rounded border border-gray-200">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200 text-left text-xs text-gray-500">
						<th class="px-3 py-2 font-medium">Day</th>
						<th class="px-3 py-2 font-medium">Description</th>
						<th class="px-3 py-2 text-right font-medium">Amount</th>
						<th class="px-3 py-2 font-medium">Sorted as</th>
						<th class="px-3 py-2"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.movements as m (m.id)}
						<tr>
							<td class="px-3 py-2 whitespace-nowrap text-gray-500 tabular-nums">
								{dayOf(m.occurredOn)}
							</td>
							<td class="max-w-md truncate px-3 py-2 text-gray-900" title={m.description}>
								{m.description}
							</td>
							<td
								class="px-3 py-2 text-right whitespace-nowrap tabular-nums {m.amountCents >= 0
									? 'text-blue-700'
									: 'text-red-600'}"
							>
								{money(m.amountCents)}
							</td>
							<td class="px-3 py-2">
								<span class="flex flex-wrap gap-1">
									{#if m.category}
										<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
											{m.category}
										</span>
									{/if}
									{#each m.tags as tag (tag)}
										<span class="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
											{tag}
										</span>
									{/each}
								</span>
							</td>
							<td class="px-3 py-2 text-right">
								<form method="post" action="?/deleteMovement" use:enhance>
									<input type="hidden" name="id" value={m.id} />
									<button class="icon-btn" aria-label="Delete this line" use:armed>
										<Icon name="trash" />
									</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
