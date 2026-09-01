<script lang="ts">
	import { enhance } from '$app/forms';
	import { settingsForm } from '$lib/actions/settings-form';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData } from './$types';
	import { THEMES } from '$lib/theme.js';
	import type { DashboardCardId } from '$lib/dashboard.js';

	let { data }: { data: PageServerData } = $props();

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

	/*
	 * The rooms, in the order this account keeps them.
	 *
	 * A local copy so the arrows and the Hide buttons can move things before
	 * anything is saved, reset from the server whenever the load re-runs — the
	 * same shape the dashboard layout below uses, for the same reason.
	 */
	let rooms = $state([...data.rooms]);
	$effect(() => {
		rooms = [...data.rooms];
	});

	/**
	 * Shown first in their order, then the ones put away.
	 *
	 * A room with no place in the menu has no place in the order either, so it
	 * falls to the bottom and loses its number — which is also what the saved
	 * order says, since the form posts this list.
	 */
	const orderedRooms = $derived([
		...rooms.filter((r) => !r.hidden),
		...rooms.filter((r) => r.hidden)
	]);

	/** The last row that can still move down: the ones below it are put away. */
	const lastShownIndex = $derived(rooms.filter((r) => !r.hidden).length - 1);

	function shiftRoom(key: string, by: number) {
		const shown = rooms.filter((r) => !r.hidden);
		const at = shown.findIndex((r) => r.key === key);
		const to = at + by;
		if (at === -1 || to < 0 || to >= shown.length) return;
		[shown[at], shown[to]] = [shown[to], shown[at]];
		rooms = [...shown, ...rooms.filter((r) => r.hidden)];
	}

	function toggleRoom(key: string) {
		rooms = rooms.map((r) => (r.key === key ? { ...r, hidden: !r.hidden } : r));
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

	/** 24-hour, like every other time in the app; 24 is the end of the day. */
	function hourLabel(h: number): string {
		return `${String(h).padStart(2, '0')}:00`;
	}

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
	<form
		method="post"
		action="?/saveWeek"
		use:settingsForm={{ notice: 'Week saved.' }}
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Week and timezone</h2>
		</div>
		<div class="flex gap-4">
			<label class="flex-1">
				<span class="eyebrow text-gray-600">First day of week</span>
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
				<span class="eyebrow text-gray-600">Generate tasks on</span>
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
			<span class="eyebrow text-gray-600">Timezone</span>
			<input autocomplete="off" name="timezone" value={data.timezone} class="input mt-1" />
		</label>
		<button class="btn btn-primary">Save</button>
	</form>

	<!-- One currency per account: a shopping list in three is a spreadsheet. -->
	<form
		method="post"
		action="?/saveCurrency"
		use:settingsForm={{ notice: 'Currency saved.' }}
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Money</h2>
			<p class="mt-1 text-sm text-gray-500">What prices on the shopping list are in.</p>
		</div>
		<label class="block max-w-[10rem]">
			<span class="eyebrow text-gray-600">Currency</span>
			<select name="currency" class="select mt-1">
				{#each data.currencies as code (code)}
					<option value={code} selected={data.currency === code}>{code}</option>
				{/each}
			</select>
		</label>
		<button class="btn btn-primary">Save</button>
	</form>

	<!--
		The hours the planner draws.

		Six to midnight is a reasonable default and a poor law: a baker's day
		starts at four and a night shift ends after it.
	-->
	<form
		method="post"
		action="?/saveGridHours"
		use:settingsForm={{ notice: 'Planner hours saved.' }}
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Planner hours</h2>
			<p class="mt-1 text-sm text-gray-500">
				The stretch of the day the day and week grids show. Anything outside it is still there — it
				just is not drawn.
			</p>
		</div>
		<div class="flex gap-4">
			<label class="flex-1 sm:max-w-[10rem]">
				<span class="eyebrow text-gray-600">Day starts at</span>
				<select name="start" class="select mt-1">
					{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
						<option value={h} selected={data.gridHours.start === h}>{hourLabel(h)}</option>
					{/each}
				</select>
			</label>
			<label class="flex-1 sm:max-w-[10rem]">
				<span class="eyebrow text-gray-600">Day ends at</span>
				<select name="end" class="select mt-1">
					{#each Array.from({ length: 24 }, (_, h) => h + 1) as h (h)}
						<option value={h} selected={data.gridHours.end === h}>{hourLabel(h)}</option>
					{/each}
				</select>
			</label>
		</div>
		<button class="btn btn-primary">Save</button>
	</form>

	<!--
		The rooms: one list, three answers.

		This was three sections — Sections, The menu, Colours — listing the same
		eight things and asking one question of each, so changing where Diary
		sits and what colour it is meant scrolling between two lists that looked
		identical. One row per room, holding its order, whether it is shown, and
		its colour.

		Home is not here, because Home is not a room: the wordmark in the header
		and the house in the phone bar are the way back. A row whose every
		control is disabled teaches you that the controls do not work.
	-->
	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">The menu</h2>
			<p class="mt-1 text-sm text-gray-500">
				The rooms, in the order they appear — along the bar, and round the wheel. First in the list
				is first along the bar and first under your thumb: the wheel starts at the bottom right and
				goes anti-clockwise.
				<a
					href="https://docs.ontoplano.com/the-wheel"
					class="font-medium text-gray-900 underline"
					rel="external">How the wheel is laid out</a
				>. A room you put away leaves every menu and keeps everything in it — its pages still open
				from a link.
			</p>
		</div>

		<form
			method="post"
			action="?/saveMenu"
			data-tour="prefs-menu"
			use:settingsForm={{ notice: 'Menu saved.' }}
			class="space-y-2"
		>
			{#each orderedRooms as room, i (room.key)}
				{@const shown = !room.hidden}
				<div
					class="flex items-center gap-3 border px-3 py-2 {shown
						? 'border-gray-200'
						: 'border-dashed border-gray-300 bg-gray-50'}"
				>
					<input type="hidden" name="room" value={room.key} />
					{#if room.hidden && room.hide}
						<input type="hidden" name="hidden" value={room.hide} />
					{/if}

					<!-- A number only where there is a position. A room that is put
					     away has no place in the order, so it has no number. -->
					<span class="tabular w-5 shrink-0 text-xs text-gray-500">
						{shown ? i + 1 : ''}
					</span>

					{#if room.ownsColor}
						<input
							type="color"
							name="color.{room.section}"
							value={room.accent}
							class="h-6 w-8 shrink-0 cursor-pointer border border-gray-300 bg-white p-0.5"
							aria-label="The colour for {room.label}"
						/>
					{:else}
						<!-- Shown, not editable: this room wears another's colour, and
						     three pickers for one value is three ways to disagree. -->
						<span
							class="h-6 w-8 shrink-0 border border-gray-200"
							style="background-color: {room.accent}"
							title="Follows {room.colorFrom}"
						></span>
					{/if}

					<span class="min-w-0 flex-1 truncate text-sm {shown ? 'text-gray-900' : 'text-gray-500'}">
						{room.label}
						{#if !room.ownsColor}
							<span class="text-xs text-gray-500">· {room.colorFrom}'s colour</span>
						{/if}
					</span>

					{#if shown}
						<button
							type="button"
							onclick={() => shiftRoom(room.key, -1)}
							disabled={i === 0}
							class="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
							title="Move up"
							aria-label="Move {room.label} up"
						>
							<Icon name="chevron-up" size={16} />
						</button>
						<button
							type="button"
							onclick={() => shiftRoom(room.key, 1)}
							disabled={i === lastShownIndex}
							class="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
							title="Move down"
							aria-label="Move {room.label} down"
						>
							<Icon name="chevron-down" size={16} />
						</button>
					{/if}

					{#if room.hide}
						<button
							type="button"
							onclick={() => toggleRoom(room.key)}
							class="btn btn-sm shrink-0"
							aria-pressed={room.hidden}
						>
							{room.hidden ? 'Show' : 'Hide'}
						</button>
					{:else}
						<span class="eyebrow shrink-0 text-gray-500">always on</span>
					{/if}
				</div>
			{/each}

			<div class="flex flex-wrap items-center gap-2 pt-2">
				<button class="btn btn-primary">Save menu</button>
				{#if !data.menuIsDefault}
					<button formaction="?/resetMenu" class="btn btn-sm">Back to the defaults</button>
				{/if}
			</div>
			<p class="text-xs text-gray-500">
				Pick dark colours: the labels on the wheel are white. The planner is always on.
			</p>
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Dashboard</h2>
			<p class="mt-1 text-sm text-gray-500">Which cards appear, and in what order.</p>
		</div>

		<form
			method="post"
			action="?/setLayout"
			use:settingsForm={{ notice: 'Dashboard layout saved.' }}
			class="space-y-2"
		>
			{#each layout as id (id)}
				{@const card = data.cards.find((c) => c.id === id)}
				{#if card}
					<div class="flex items-center gap-3 border border-gray-200 px-3 py-2">
						<input type="hidden" name="card" value={id} />
						<div class="flex flex-col">
							<button
								type="button"
								onclick={() => shift(id, -1)}
								class="text-xs leading-none text-gray-500 hover:text-gray-900"
								aria-label="Move {card.label} up">&uarr;</button
							>
							<button
								type="button"
								onclick={() => shift(id, 1)}
								class="text-xs leading-none text-gray-500 hover:text-gray-900"
								aria-label="Move {card.label} down">&darr;</button
							>
						</div>
						<div class="min-w-0 flex-1">
							<span class="text-sm font-medium text-gray-900">{card.label}</span>
							<p class="text-xs text-gray-500">{card.description}</p>
						</div>
						<button type="button" onclick={() => toggle(id)} class="btn btn-sm">Hide</button>
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
					<button type="button" onclick={() => toggle(card.id)} class="btn btn-sm">Show</button>
				</div>
			{/each}

			<div class="flex gap-2 pt-1">
				<button class="btn btn-primary">Save layout</button>
				<button formaction="?/resetLayout" class="btn">Reset to defaults</button>
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
								<button class="btn btn-danger btn-sm" use:armed>Confirm?</button>
								<button
									type="button"
									onclick={() => (confirmRemove = null)}
									class="text-xs text-gray-500 hover:text-gray-900">Cancel</button
								>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirmRemove = quote.id)}
								class="text-xs text-gray-500 hover:text-red-600"
								><Icon name="trash" /> Remove</button
							>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<EmptyState icon="note" title="No quotes yet" compact />
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
				<span class="eyebrow text-gray-600">Quote</span>
				<input
					name="text"
					required
					autocomplete="off"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<label class="w-44">
				<span class="eyebrow text-gray-600">Author</span>
				<input
					name="author"
					autocomplete="off"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<button class="btn btn-primary"><Icon name="plus" /> Add</button>
		</form>

		<!-- One at a time is fine for one; nobody types a collection in that way. -->
		<details class="mt-4 border-t border-gray-200 pt-4">
			<summary class="cursor-pointer list-none text-sm text-gray-600 hover:text-gray-900">
				<span class="text-xs text-gray-500">▸</span> Paste a list
			</summary>

			<form
				method="post"
				action="?/importQuotes"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: true })}
				class="mt-3 space-y-2"
			>
				<label class="block">
					<span class="eyebrow text-gray-600">One per line</span>
					<textarea
						name="quotes"
						rows="6"
						class="textarea mt-1"
						placeholder={'Plans are worthless, but planning is everything. — Eisenhower\nWhat gets measured gets managed -- Drucker\nA quote with nobody to attribute it to'}
					></textarea>
				</label>
				<p class="text-xs text-gray-500">
					Not CSV: half of all quotes have a comma in them. The author is whatever follows the last
					dash on the line, and duplicates are skipped.
				</p>
				<button class="btn btn-primary"><Icon name="plus" /> Import</button>
			</form>
		</details>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Style</h2>
			<p class="mt-1 text-sm text-gray-500">The shape of things, apart from light and dark.</p>
		</div>

		<form
			method="post"
			action="?/setStyle"
			use:enhance={({ formData }) => {
				// <html> is outside the component tree, so `update()` will not touch it.
				const chosen = formData.get('style')?.toString();
				if (chosen) document.documentElement.dataset.style = chosen;
				return async ({ update }) => update({ reset: false });
			}}
			class="grid gap-3 sm:grid-cols-2"
		>
			{#each data.styles as option (option.key)}
				<button
					type="submit"
					name="style"
					value={option.key}
					class="border p-4 text-left {data.style === option.key
						? 'border-gray-900 bg-gray-50'
						: 'border-gray-300 bg-white hover:bg-gray-50'}"
				>
					<span class="block text-sm font-semibold text-gray-900">{option.label}</span>
					<span class="mt-1 block text-xs text-gray-500">{option.hint}</span>
				</button>
			{/each}
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
			data-tour="prefs-theme"
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

	{#if data.errorReports !== 'off'}
		<section class="border border-gray-200 bg-white p-5 shadow-card">
			<h2 class="text-sm font-semibold text-gray-900">Error reports</h2>
			<p class="mt-1 text-sm text-gray-500">
				When a page breaks, send the technical details to this server's log. Only what broke — never
				what you wrote.
			</p>
			<form
				method="post"
				action="?/setErrorReports"
				use:settingsForm={{ notice: 'Saved.' }}
				class="mt-3 flex gap-2"
			>
				{#each [['yes', 'Send'], ['no', 'Never']] as [value, label] (value)}
					<button
						type="submit"
						name="decision"
						{value}
						class="border px-4 py-2 text-sm shadow-sm {data.errorReports === value
							? 'border-gray-900 bg-gray-900 font-semibold text-white'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
					>
						{label}
					</button>
				{/each}
			</form>
		</section>
	{/if}
</div>
