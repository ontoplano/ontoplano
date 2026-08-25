<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';
	import { THEMES } from '$lib/theme.js';
	import type { DashboardCardId } from '$lib/dashboard.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// Local copy so a card can be toggled and reordered before saving.
	let layout: DashboardCardId[] = $state([...data.layout]);
	$effect(() => {
		layout = [...data.layout];
	});

	function isOn(id: DashboardCardId): boolean {
		return layout.includes(id);
	}

	function toggle(id: DashboardCardId) {
		layout = isOn(id) ? layout.filter((x) => x !== id) : [...layout, id];
	}

	function shift(id: DashboardCardId, by: number) {
		const at = layout.indexOf(id);
		const to = at + by;
		if (at === -1 || to < 0 || to >= layout.length) return;
		const next = [...layout];
		[next[at], next[to]] = [next[to], next[at]];
		layout = next;
	}

	const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	// Removing a quote is destructive, so it takes two clicks like every other
	// delete in the app.
	let confirmRemove = $state<number | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') confirmRemove = null;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if form?.success && form.action === 'setLayout'}
		<div class="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
			Dashboard layout saved.
		</div>
	{/if}

	<form
		method="post"
		action="?/saveWeek"
		use:enhance
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Week and timezone</h2>
		</div>
		<div class="flex gap-4">
			<label class="flex-1">
				<span class="eyebrow text-gray-500">First day of week</span>
				<select
					name="firstDay"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				>
					{#each dayNames as day, i (i)}
						<option value={i} selected={data.week.firstDay === i}>{day}</option>
					{/each}
				</select>
			</label>
			<label class="flex-1">
				<span class="eyebrow text-gray-500">Generate tasks on</span>
				<select
					name="generateDay"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				>
					{#each dayNames as day, i (i)}
						<option value={i} selected={data.week.generateDay === i}>{day}</option>
					{/each}
				</select>
			</label>
		</div>
		<label class="block max-w-xs">
			<span class="eyebrow text-gray-500">Timezone</span>
			<input name="timezone" value={data.timezone} class="input mt-1" />
		</label>
		<button class="btn btn-primary">Save</button>
	</form>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Dashboard</h2>
			<p class="mt-1 text-sm text-gray-500">Which cards appear, and in what order.</p>
		</div>

		<form method="post" action="?/setLayout" use:enhance class="space-y-2">
			{#each layout as id (id)}
				{@const card = data.cards.find((c) => c.id === id)}
				{#if card}
					<div class="flex items-center gap-3 border border-gray-200 px-3 py-2">
						<input type="hidden" name="card" value={id} />
						<div class="flex flex-col">
							<button
								type="button"
								onclick={() => shift(id, -1)}
								class="text-xs leading-none text-gray-400 hover:text-gray-900"
								aria-label="Move {card.label} up">&uarr;</button
							>
							<button
								type="button"
								onclick={() => shift(id, 1)}
								class="text-xs leading-none text-gray-400 hover:text-gray-900"
								aria-label="Move {card.label} down">&darr;</button
							>
						</div>
						<div class="min-w-0 flex-1">
							<span class="text-sm font-medium text-gray-900">{card.label}</span>
							<p class="text-xs text-gray-500">{card.description}</p>
						</div>
						<button
							type="button"
							onclick={() => toggle(id)}
							class="border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
							>Hide</button
						>
					</div>
				{/if}
			{/each}

			{#each data.cards.filter((c) => !isOn(c.id)) as card (card.id)}
				<div
					class="flex items-center gap-3 border border-dashed border-gray-300 px-3 py-2 opacity-60"
				>
					<div class="min-w-0 flex-1">
						<span class="text-sm font-medium text-gray-900">{card.label}</span>
						<p class="text-xs text-gray-500">{card.description}</p>
					</div>
					<button
						type="button"
						onclick={() => toggle(card.id)}
						class="border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
						>Show</button
					>
				</div>
			{/each}

			<div class="flex gap-2 pt-1">
				<button class="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
					>Save layout</button
				>
				<button
					formaction="?/resetLayout"
					class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>Reset to defaults</button
				>
			</div>
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Quotes</h2>
			<p class="mt-1 text-sm text-gray-500">One is shown per day on the dashboard.</p>
		</div>

		{#if data.quotes.length > 0}
			<div class="mb-3 divide-y divide-gray-200 border border-gray-200">
				{#each data.quotes as quote (quote.id)}
					<div class="flex items-start gap-3 px-3 py-2">
						<div class="min-w-0 flex-1">
							<p class="text-sm text-gray-900 italic">&ldquo;{quote.text}&rdquo;</p>
							{#if quote.author}
								<p class="text-xs text-gray-500">&mdash; {quote.author}</p>
							{/if}
						</div>
						{#if confirmRemove === quote.id}
							<form
								method="post"
								action="?/deleteQuote"
								use:enhance={() =>
									async ({ update }) => {
										confirmRemove = null;
										await update();
									}}
								class="flex items-center gap-2"
							>
								<input type="hidden" name="id" value={quote.id} />
								<button
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
									>Confirm?</button
								>
								<button
									type="button"
									onclick={() => (confirmRemove = null)}
									class="text-xs text-gray-400 hover:text-gray-900">Cancel</button
								>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirmRemove = quote.id)}
								class="text-xs text-gray-400 hover:text-red-600">Remove</button
							>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="mb-3 text-sm text-gray-400">No quotes yet.</p>
		{/if}

		<form
			method="post"
			action="?/addQuote"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: true })}
			class="flex flex-wrap items-end gap-2"
		>
			<label class="min-w-64 flex-1">
				<span class="eyebrow text-gray-500">Quote</span>
				<input
					name="text"
					required
					autocomplete="off"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<label class="w-44">
				<span class="eyebrow text-gray-500">Author</span>
				<input
					name="author"
					autocomplete="off"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<button class="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
				>Add</button
			>
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Appearance</h2>
			<p class="mt-1 text-sm text-gray-500">
				&ldquo;System&rdquo; uses whatever your device is set to.
			</p>
		</div>

		<form
			method="post"
			action="?/setTheme"
			use:enhance={({ formData }) => {
				// <html> is outside the component tree, so `update()` will not touch it.
				const chosen = formData.get('theme')?.toString();
				if (chosen) document.documentElement.dataset.theme = chosen;
				return async ({ update }) => update({ reset: false });
			}}
			class="flex gap-2"
		>
			{#each THEMES as option (option)}
				<button
					type="submit"
					name="theme"
					value={option}
					class="border px-4 py-2 text-sm capitalize shadow-sm {data.theme === option
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
				>
					{option}
				</button>
			{/each}
		</form>
	</section>
</div>
