<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Landing from '$lib/components/Landing.svelte';
	import QuickCapture from '$lib/components/QuickCapture.svelte';
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { SECTION_COLORS, CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { cardById, type DashboardCardId } from '$lib/dashboard.js';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { getAction } from '$lib/shortcuts';

	/** Keep the card a card: the tracker is one click away for the full list. */
	const TODO_PREVIEW = 5;
	const GOAL_PREVIEW = 4;

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// Rearranging is a mode rather than something you can trigger by accident:
	// the cards hold forms and links, and making them permanently draggable
	// would fight every click you actually meant.
	let arranging = $state(false);
	let capture = $state<QuickCapture | undefined>();
	let captureTiles = $state<QuickCapture | undefined>();
	let order: DashboardCardId[] = $state([]);
	let dragging: DashboardCardId | null = $state(null);
	let dragOver: DashboardCardId | null = $state(null);

	/**
	 * Signed out, this route is the pitch and there is no dashboard.
	 *
	 * One route with two audiences: the template picks between them, but the
	 * script above it runs either way, so the places that reach for dashboard
	 * data say what they mean when there is none.
	 */
	const layout = $derived(arranging ? order : (data.layout ?? []));

	function startArranging() {
		order = [...layout];
		arranging = true;
	}

	/**
	 * Moving a card without a mouse.
	 *
	 * Arrange mode was HTML5 drag-and-drop, which does not exist on a touch
	 * screen at all — so on a phone the mode opened, said "drag the cards to
	 * reorder them", and then could not be used. Two buttons work with a thumb,
	 * with a keyboard, and with a screen reader, and for eight cards they are
	 * quicker than dragging anyway.
	 */
	function move(id: DashboardCardId, delta: number) {
		const from = order.indexOf(id);
		const to = from + delta;
		if (from === -1 || to < 0 || to >= order.length) return;

		const next = [...order];
		next.splice(to, 0, ...next.splice(from, 1));
		order = next;
	}

	function onDragStart(id: DashboardCardId, e: DragEvent) {
		dragging = id;
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(id: DashboardCardId, e: DragEvent) {
		e.preventDefault();
		dragOver = id;
		if (!dragging || dragging === id) return;
		const next = order.filter((x) => x !== dragging);
		next.splice(next.indexOf(id), 0, dragging);
		order = next;
	}

	async function saveOrder() {
		const body = new FormData();
		for (const id of order) body.append('card', id);
		const res = await fetch('/?/setLayout', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		deserialize(await res.text());
		arranging = false;
		dragging = null;
		dragOver = null;
		await invalidateAll();
	}

	async function hideCard(id: DashboardCardId) {
		order = order.filter((x) => x !== id);
	}

	let showDiaryForm = $state(false);
	let showWinsForm = $state(false);

	// The three-wins card is now a layout choice; this only gates its keybind.
	const winsEnabled = $derived(layout.includes('threeWins'));

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function truncate(text: string, max: number): string {
		if (text.length <= max) return text;
		return text.slice(0, max).trimEnd() + '…';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			showDiaryForm = false;
			showWinsForm = false;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		// Quick capture first: those four keys belong to it wherever it is shown.
		// Both shapes are mounted; only one is visible, and either will do.
		if (capture?.openByShortcut(e.key) || captureTiles?.openByShortcut(e.key)) {
			e.preventDefault();
			return;
		}

		const action = getAction('/', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'new-diary':
				showDiaryForm = !showDiaryForm;
				showWinsForm = false;
				if (showDiaryForm) {
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
						ta?.focus();
					});
				}
				break;
			case 'new-wins':
				if (!winsEnabled) break;
				showWinsForm = !showWinsForm;
				showDiaryForm = false;
				if (showWinsForm) {
					tick().then(() => {
						const input = document.querySelector<HTMLInputElement>('input[name="win_0"]');
						input?.focus();
					});
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if data.landing}
	<!-- Signed out, the front page is the pitch. -->
	<Landing {...data.landing} />
{:else}
	<div class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h1 class="text-lg font-bold text-gray-900">
				{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
			</h1>
			{#if !arranging}
				<div class="flex items-center gap-2">
					<QuickCapture bind:this={capture} error={form?.message} inline />
					<button onclick={startArranging} class="btn btn-sm">
						<Icon name="drag" /> Arrange
					</button>
				</div>
			{/if}
		</div>

		<!-- Phone-first: the reason someone opens this app at a bus stop is to write
	     one thing down before it evaporates. -->
		<QuickCapture bind:this={captureTiles} error={form?.message} />

		<!--
	An empty card says what the thing is for and offers the way in.

	"No goals running." on its own is a dead end on the one screen a new
	account opens first.
-->
		{#snippet nothingYet(text: string, href: string, action: string)}
			<p class="text-sm text-gray-500">{text}</p>
			<a {href} class="btn btn-sm mt-3 inline-flex">{action}</a>
		{/snippet}

		<!--
		Last week, if nobody has closed it.

		The review page existed for a week before this line did, and in that week
		nothing ever asked anybody to open it — which was the exact complaint that
		made the page worth building. One line, above the fold, only while there is
		a finished week with something in it and no write-up.
	-->
		{#if data.pendingReview}
			<a
				href="/planner/review?week={data.pendingReview.weekStart}"
				class="flex items-center gap-3 border border-gray-200 bg-white px-4 py-3 shadow-card transition hover:bg-gray-50"
			>
				<span class="text-gray-500"><Icon name="clock" size={16} /></span>
				<span class="min-w-0 flex-1 text-sm text-gray-900">
					Last week is still open — {data.pendingReview.planned} blocks, no write-up.
				</span>
				<span class="shrink-0 text-xs text-gray-500">Review it</span>
				<Icon name="chevron-right" size={14} />
			</a>
		{/if}

		<!--
		What is happening now, above everything else.

		The dashboard used to open with "0 / 11 · 11 to go" — a score about the
		past at the top of the screen somebody opens to ask what to do next. The
		count is still there; it is just no longer the answer.
	-->
		{#if data.now}
			{@const { task, state, minutes } = data.now}
			<section
				class="card-accent flex flex-col border border-gray-200 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:gap-6"
				style="--card-accent: {task.categoryColor ?? SECTION_COLORS.planner}"
			>
				<div class="min-w-0 flex-1">
					<span class="eyebrow text-gray-600">
						{state === 'now' ? 'Now' : 'Next'}
					</span>
					<p class="mt-1 text-xl font-bold text-gray-900">{task.name}</p>
					<p class="mt-1 text-sm text-gray-500">
						<span class="tabular">{task.startTime}</span>
						{#if task.categoryName}· {task.categoryName}{/if}
						·
						{#if state === 'now'}
							{minutes} {minutes === 1 ? 'minute' : 'minutes'} left
						{:else if minutes < 60}
							in {minutes} {minutes === 1 ? 'minute' : 'minutes'}
						{:else}
							in {Math.round(minutes / 60)} {Math.round(minutes / 60) === 1 ? 'hour' : 'hours'}
						{/if}
					</p>
				</div>

				<!--
				Two answers, because there are two.

				A block you planned and did not do is not a failure the app should
				make you argue with: some weeks the gym does not happen, and saying so
				is the honest input. Leaving only "Done" meant the only way to tell
				the truth was to say nothing, which is how a tracker starts lying.
			-->
				<div class="mt-3 flex shrink-0 items-center gap-2 sm:mt-0">
					<form method="post" action="/planner/board?/setStatus" use:enhance>
						<input type="hidden" name="id" value={task.id} />
						<input type="hidden" name="kind" value="instance" />
						<input type="hidden" name="status" value="done" />
						<button class="btn btn-primary"><Icon name="check" /> Done</button>
					</form>

					<form method="post" action="/planner/board?/setStatus" use:enhance>
						<input type="hidden" name="id" value={task.id} />
						<input type="hidden" name="kind" value="instance" />
						<input type="hidden" name="status" value="skipped" />
						<button class="btn"><Icon name="skip" /> Skipped</button>
					</form>
				</div>
			</section>
		{/if}

		{#snippet card_todayTasks()}
			<Card title="Today's Tasks" accent={SECTION_COLORS.planner}>
				{#snippet actions()}
					<a href="/planner/board" class="text-xs text-gray-500 hover:text-gray-900"> Open → </a>
				{/snippet}
				{#if data.taskSummary.total === 0}
					{@render nothingYet(
						'Nothing is planned for today. A block is a time you have given to something.',
						'/planner/plan',
						'Open the plan'
					)}
				{:else}
					<div class="flex items-baseline gap-3">
						<span class="text-2xl font-bold text-gray-900">
							{data.taskSummary.done}
							<span class="text-sm font-normal text-gray-500">/ {data.taskSummary.total}</span>
						</span>
						<span class="text-xs text-gray-500">
							{data.tasksTodo.length === 0
								? 'nothing left today'
								: `${data.tasksTodo.length} to go`}
						</span>
					</div>

					{#if data.tasksTodo.length > 0}
						<ul class="mt-3 divide-y divide-gray-100 border-t border-gray-100">
							{#each data.tasksTodo.slice(0, TODO_PREVIEW) as task (`${task.kind}-${task.id}`)}
								<li class="flex items-center gap-3 py-1.5">
									<!-- Finishing something from the screen you are already on. It
								     used to be a list you could only read. -->
									<form method="post" action="/planner/board?/setStatus" use:enhance>
										<input type="hidden" name="id" value={task.id} />
										<input type="hidden" name="kind" value="instance" />
										<input type="hidden" name="status" value="done" />
										<button
											class="-m-1 flex shrink-0 items-center justify-center p-1 pointer-coarse:w-11"
											title="Done"
											aria-label="Mark {task.name} done"
										>
											<span
												class="flex h-4 w-4 items-center justify-center border border-gray-400 bg-white"
											></span>
										</button>
									</form>
									<span
										class="w-1 shrink-0 self-stretch"
										style="background-color: {task.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
									></span>
									<span class="tabular w-12 shrink-0 font-mono text-xs text-gray-500"
										>{task.startTime}</span
									>
									<span class="truncate text-sm text-gray-900">{task.name}</span>
									{#if task.kind === 'once'}
										<span
											class="ml-auto shrink-0 text-[10px] tracking-wide text-blue-600 uppercase"
										>
											one-off
										</span>
									{/if}
								</li>
							{/each}
						</ul>
						{#if data.tasksTodo.length > TODO_PREVIEW}
							<p class="mt-1 text-xs text-gray-500">
								+{data.tasksTodo.length - TODO_PREVIEW} more
							</p>
						{/if}
					{/if}

					<div class="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
						{#if data.taskSummary.done > 0}
							<span>{data.taskSummary.done} done</span>
						{/if}
						{#if data.taskSummary.doing > 0}
							<span>{data.taskSummary.doing} in progress</span>
						{/if}
						{#if data.taskSummary.skipped > 0}
							<span>{data.taskSummary.skipped} skipped</span>
						{/if}
						{#if data.taskSummary.late > 0}
							<span>{data.taskSummary.late} late</span>
						{/if}
						{#if data.taskSummary.early > 0}
							<span>{data.taskSummary.early} early</span>
						{/if}
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_goals()}
			<Card title="Goals" accent={SECTION_COLORS.goals}>
				{#snippet actions()}
					<a href="/goals" class="text-xs text-gray-500 hover:text-gray-900">Open &rarr;</a>
				{/snippet}
				{#if data.activeGoals.length === 0}
					{@render nothingYet(
						'No goals for this period. A goal is a commitment with a date attached.',
						'/goals',
						'New goal'
					)}
				{:else}
					<ul class="space-y-2">
						{#each data.activeGoals.slice(0, GOAL_PREVIEW) as goal (goal.id)}
							{@const pct =
								goal.progress.fraction === null ? null : Math.round(goal.progress.fraction * 100)}
							<li class="flex items-center gap-3">
								<span
									class="h-4 w-1 shrink-0"
									style="background-color: {goal.areaColor ?? CATEGORY_FALLBACK_COLOR}"
									title={goal.areaName ?? 'No area'}
								></span>
								<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{goal.title}</span>
								<!-- Nothing to count, nothing to draw: an empty track reads as
							     zero progress rather than as no measure. -->
								{#if pct !== null}
									<span class="h-1.5 w-16 shrink-0 bg-gray-200">
										<span
											class="block h-full"
											style="width: {pct}%; background-color: {goal.areaColor ??
												SECTION_COLORS.goals}"
										></span>
									</span>
									<span class="tabular w-10 shrink-0 text-right text-xs text-gray-500">{pct}%</span>
								{:else}
									<span class="shrink-0 text-xs text-gray-500">no measure</span>
								{/if}
							</li>
						{/each}
					</ul>
					{#if data.activeGoals.length > GOAL_PREVIEW}
						<p class="mt-2 text-xs text-gray-500">
							+{data.activeGoals.length - GOAL_PREVIEW} more
						</p>
					{/if}
				{/if}
			</Card>
		{/snippet}

		{#snippet card_habits()}
			<Card title="Habits" accent={SECTION_COLORS.health}>
				{#snippet actions()}
					<a href="/health/habits" class="text-xs text-gray-500 hover:text-gray-900"> Open → </a>
				{/snippet}
				{#if data.habitStreaks.length === 0}
					{@render nothingYet(
						'Nothing tracked yet. A habit is something you want to do — or stop doing — most days.',
						'/health/habits',
						'New habit'
					)}
				{:else}
					<div class="space-y-2">
						{#each data.habitStreaks as habit (habit.id)}
							<div class="flex items-center justify-between">
								<span class="text-sm text-gray-700">{habit.name}</span>
								<span
									class="text-xs font-medium {habit.type === 'bad'
										? habit.streak > 0
											? 'text-blue-600'
											: 'text-red-600'
										: habit.type === 'neutral'
											? habit.streak > 0
												? 'text-gray-600'
												: 'text-gray-500'
											: habit.streak > 0
												? 'text-blue-600'
												: 'text-gray-500'}"
								>
									{habit.streak}d
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_weekPlan()}
			{@const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
			{@const todayDow = new Date().getDay()}
			{@const todayIndex = todayDow === 0 ? 6 : todayDow - 1}
			{@const timeSlots = [
				...new Set(data.weekSlots.map((s: { startTime: string }) => s.startTime))
			].sort()}
			<Card title="Week Plan" accent={SECTION_COLORS.planner}>
				{#snippet actions()}
					<a href="/planner/plan" class="text-xs text-gray-500 hover:text-gray-900">Edit →</a>
				{/snippet}
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead>
							<tr>
								{#each DAYS as day, i}
									<th
										class="px-1 py-1 text-center font-medium {i === todayIndex
											? 'bg-gray-100 text-gray-900'
											: 'text-gray-500'}"
									>
										{day}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each timeSlots as time}
								<tr class="border-t border-gray-100">
									{#each Array(7) as _, day}
										{@const slots = data.weekSlots.filter(
											(s: { weekday: number; startTime: string }) =>
												s.weekday === day && s.startTime === time
										)}
										<td class="px-1 py-0.5 {day === todayIndex ? 'bg-gray-50' : ''}">
											{#each slots as slot}
												<!--
												The category colour is a mark beside the label, not the
												label's own ink. As text at 12px it was only as readable
												as the colour happened to be — a pale category was
												unreadable on a light page and a deep one on a dark page,
												and it is the user who picks the colour.
											-->
												<div
													class="flex items-center gap-1 leading-tight text-gray-700"
													title="{time} - {slot.activityName || slot.label || slot.categoryName}"
												>
													<span
														class="h-2.5 w-0.5 shrink-0 rounded-full"
														style="background-color: {slot.categoryColor || '#6b7280'}"
													></span>
													<span class="shrink-0 text-gray-500">{time.slice(0, 5)}</span>
													<span class="truncate"
														>{slot.activityName || slot.label || slot.categoryName}</span
													>
												</div>
											{/each}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/snippet}

		{#snippet card_diary()}
			<Card title="Diary" accent={SECTION_COLORS.diary}>
				{#snippet actions()}
					<div class="flex items-center gap-3">
						<a href="/diary" class="text-xs text-gray-500 hover:text-gray-900"> All entries → </a>
						{#if winsEnabled}
							<button
								onclick={() => {
									showWinsForm = !showWinsForm;
									showDiaryForm = false;
									if (showWinsForm) {
										tick().then(() => {
											const input = document.querySelector<HTMLInputElement>('input[name="win_0"]');
											input?.focus();
										});
									}
								}}
								class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
							>
								{showWinsForm ? 'Cancel' : 'Wins'}
								<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">w</kbd>
							</button>
						{/if}
						<button
							onclick={() => {
								showDiaryForm = !showDiaryForm;
								showWinsForm = false;
							}}
							class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
						>
							{showDiaryForm ? 'Cancel' : 'New entry'}
						</button>
					</div>
				{/snippet}

				{#if showDiaryForm}
					<form
						method="post"
						action="?/createDiaryEntry"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								showDiaryForm = false;
							};
						}}
						class="mb-4 space-y-3 border border-gray-100 bg-gray-50 p-3"
					>
						<textarea
							name="content"
							required
							rows="3"
							placeholder="What's on your mind?"
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						></textarea>
						<input
							autocomplete="off"
							name="tags"
							type="text"
							placeholder="Tags (comma-separated)"
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<button
							type="submit"
							class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
						>
							Save
						</button>
					</form>
				{/if}

				{#if winsEnabled && showWinsForm}
					<form
						method="post"
						action="?/createWins"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								showWinsForm = false;
							};
						}}
						class="mb-4 space-y-3 border border-gray-100 bg-gray-50 p-3"
					>
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-gray-700">3 Wins</span>
							<input
								autocomplete="off"
								name="forDate"
								type="date"
								value={new Date().toISOString().slice(0, 10)}
								class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							/>
						</div>
						<input
							autocomplete="off"
							name="win_0"
							type="text"
							placeholder="Win 1"
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<input
							autocomplete="off"
							name="win_1"
							type="text"
							placeholder="Win 2"
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<input
							autocomplete="off"
							name="win_2"
							type="text"
							placeholder="Win 3"
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<button
							type="submit"
							class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
						>
							Save Wins
						</button>
					</form>
				{/if}

				{#if data.lastEntry}
					<div>
						<p class="text-sm leading-relaxed text-gray-700">
							{truncate(data.lastEntry.content, 300)}
						</p>
						<div class="mt-2 flex items-center gap-2">
							<span class="text-xs text-gray-500">{formatDate(data.lastEntry.createdAt)}</span>
							{#each data.lastEntry.tags as tag (tag.id)}
								<span class="border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500"
									>{tag.name}</span
								>
							{/each}
						</div>
					</div>
				{:else}
					{@render nothingYet(
						'Nothing written yet. Whatever happened today, in as many or as few words as you like.',
						'/diary',
						'New entry'
					)}
				{/if}
			</Card>
		{/snippet}

		{#snippet card_shopping()}
			<Card title="Shopping" accent={SECTION_COLORS.shopping}>
				{#snippet actions()}
					<a href="/shopping" class="text-xs text-gray-500 hover:text-gray-900">Open →</a>
				{/snippet}
				{#if data.shoppingToBuy.length === 0}
					{@render nothingYet(
						'Nothing to buy. The list keeps what you are out of and what you might want one day.',
						'/shopping',
						'Add an item'
					)}
				{:else}
					<div class="space-y-1">
						{#each data.shoppingToBuy.slice(0, 8) as item (item.id)}
							<div class="flex items-center gap-2">
								<span class="text-sm text-gray-700">{item.name}</span>
								<span
									class="text-[10px] {item.type === 'replenish'
										? 'text-cyan-600'
										: 'text-orange-600'}"
								>
									{item.type === 'replenish' ? 'inventory' : 'someday'}
								</span>
							</div>
						{/each}
						{#if data.shoppingToBuy.length > 8}
							<span class="text-xs text-gray-500">+{data.shoppingToBuy.length - 8} more</span>
						{/if}
					</div>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_quote()}
			<Card title="Today" accent={SECTION_COLORS.home}>
				{#snippet actions()}
					<a href="/settings/preferences" class="text-xs text-gray-500 hover:text-gray-900"
						>Edit &rarr;</a
					>
				{/snippet}
				{#if data.quote}
					<blockquote class="text-sm text-gray-900 italic">
						&ldquo;{data.quote.text}&rdquo;
					</blockquote>
					{#if data.quote.author}
						<p class="mt-1 text-xs text-gray-500">&mdash; {data.quote.author}</p>
					{/if}
				{:else}
					<p class="text-sm text-gray-500">No quotes yet. Add some in config.</p>
				{/if}
			</Card>
		{/snippet}

		{#snippet card_threeWins()}
			<Card title="Three wins" accent={SECTION_COLORS.diary}>
				{#snippet actions()}
					<span class="text-xs text-gray-500">What went well today</span>
				{/snippet}
				<!-- Rows of their own rather than diary prose, so they can be counted later. -->
				<form method="post" action="?/saveWins" use:enhance class="space-y-2">
					{#each [1, 2, 3] as position (position)}
						<div class="flex items-center gap-2">
							<span class="tabular w-4 shrink-0 text-xs text-gray-500">{position}</span>
							<input
								name="win_{position}"
								autocomplete="off"
								value={data.wins.find((w) => w.position === position)?.content ?? ''}
								class="block w-full border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							/>
						</div>
					{/each}
					<button class="btn btn-primary btn-sm"> Save </button>
				</form>
			</Card>
		{/snippet}

		<!--
		`grid-flow-dense` so a half-width card fills a gap a full-width one left
		beside it. On a sparse account, where most cards are one line, the
		difference is a screen of empty space or none.
	-->
		<div class="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
			{#each layout as id (id)}
				{@const card = cardById(id)}
				{#if card}
					<!-- Half-width cards pair up on wide screens; full-width ones take the row. -->
					<div
						class="{card.width === 'half'
							? 'md:col-span-1'
							: 'md:col-span-2 2xl:col-span-3'} {arranging ? 'cursor-grab' : ''} {dragging === id
							? 'opacity-40'
							: ''} {arranging && dragOver === id ? 'outline-2 outline-gray-900' : ''}"
						draggable={arranging}
						ondragstart={(e) => onDragStart(id, e)}
						ondragend={() => {
							dragging = null;
							dragOver = null;
						}}
						ondragover={(e) => onDragOver(id, e)}
						role={arranging ? 'listitem' : undefined}
					>
						{#if arranging}
							<div
								class="mb-1 flex items-center justify-between gap-2 border border-gray-300 bg-gray-100 px-2 py-1"
							>
								<span class="eyebrow min-w-0 truncate text-gray-600">{card.label}</span>
								<div class="flex shrink-0 items-center gap-1">
									<button
										onclick={() => move(id, -1)}
										disabled={order.indexOf(id) === 0}
										class="p-1 text-gray-600 hover:text-gray-900"
										title="Move up"
										aria-label="Move {card.label} up"
									>
										<Icon name="chevron-up" size={16} />
									</button>
									<button
										onclick={() => move(id, 1)}
										disabled={order.indexOf(id) === order.length - 1}
										class="p-1 text-gray-600 hover:text-gray-900"
										title="Move down"
										aria-label="Move {card.label} down"
									>
										<Icon name="chevron-down" size={16} />
									</button>
									<button
										onclick={() => hideCard(id)}
										class="text-xs text-gray-500 hover:text-gray-900"
										title="Hide this card"
									>
										Hide
									</button>
								</div>
							</div>
						{/if}
						{#if id === 'todayTasks'}{@render card_todayTasks()}
						{:else if id === 'goals'}{@render card_goals()}
						{:else if id === 'habits'}{@render card_habits()}
						{:else if id === 'weekPlan'}{@render card_weekPlan()}
						{:else if id === 'diary'}{@render card_diary()}
						{:else if id === 'shopping'}{@render card_shopping()}
						{:else if id === 'quote'}{@render card_quote()}
						{:else if id === 'threeWins'}{@render card_threeWins()}
						{/if}
					</div>
				{/if}
			{/each}
		</div>

		{#if arranging}
			<div
				class="flex flex-wrap items-center gap-2 border border-gray-200 bg-white p-3 shadow-card"
			>
				<span class="text-xs text-gray-500">
					Move the cards with the arrows<span class="kbd-hint">, or drag them</span>.
				</span>
				{#each data.cards.filter((c) => !order.includes(c.id)) as card (card.id)}
					<button
						onclick={() => (order = [...order, card.id])}
						class="border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
						title={card.description}
					>
						+ {card.label}
					</button>
				{/each}
				<button
					onclick={saveOrder}
					class="ml-auto bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
					>Done</button
				>
				<button
					onclick={() => (arranging = false)}
					class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
					>Cancel</button
				>
			</div>
		{/if}

		<FormError message={form?.message} />
	</div>
{/if}
