<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ActionData, PageData } from './$types';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { armed } from '$lib/actions/armed';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/**
	 * The week, once it is over.
	 *
	 * Three questions in the order they are worth asking: what you planned
	 * against what you did, what did not happen and does it still need to, and
	 * three lines you will actually want to read in a year. The first is a
	 * reading, the second is the only one with a button, and the third is the
	 * point.
	 */

	let carrying = $state<number[]>([]);

	function toggle(id: number) {
		carrying = carrying.includes(id) ? carrying.filter((c) => c !== id) : [...carrying, id];
	}

	const rate = $derived(data.reading.planned === 0 ? 0 : data.reading.done / data.reading.planned);

	function hours(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}min`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}min`;
	}

	function pretty(dateStr: string): string {
		return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	/** The stale row whose "let it go" has been armed. Nothing deletes on one press. */
	let dropping = $state<string | null>(null);

	const SORT_LABELS: Record<string, string> = {
		todo: 'Todo',
		idea: 'Idea',
		shopping: 'Someday'
	};

	function lineAt(position: number): string {
		return data.lines.find((l) => l.position === position)?.content ?? '';
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-base font-semibold text-gray-900">
				Week {data.week.number}, {data.week.year}
			</h2>
			<p class="text-sm text-gray-500">
				{pretty(data.reading.weekStart)} — {pretty(data.reading.weekEnd)}
				{#if data.week.isCurrent}
					· still running
				{/if}
			</p>
		</div>

		<div class="flex items-center gap-2">
			<button
				class="btn btn-sm"
				title="Previous week"
				aria-label="Previous week"
				onclick={() => goto(`/planner/review?week=${data.week.prev}`)}
			>
				<Icon name="chevron-left" size={16} />
			</button>
			<button
				class="btn btn-sm"
				title="Next week"
				aria-label="Next week"
				onclick={() => goto(`/planner/review?week=${data.week.next}`)}
			>
				<Icon name="chevron-right" size={16} />
			</button>
		</div>
	</div>

	{#if data.reading.planned === 0}
		<div class="border border-gray-200 bg-white shadow-card">
			<EmptyState
				icon="calendar"
				title="Nothing was planned that week"
				description="A review needs a week with something in it. Try the week before, or plan this one."
			/>
		</div>
	{:else}
		<div class="grid gap-4 lg:grid-cols-3">
			<!-- What you planned against what you did. -->
			<Card title="The week" accent="var(--section-accent)">
				<div class="space-y-3">
					<div class="flex items-baseline gap-2">
						<span class="tabular text-3xl font-bold text-gray-900">{data.reading.done}</span>
						<span class="text-sm text-gray-500">
							of {data.reading.planned} blocks · {Math.round(rate * 100)}%
						</span>
					</div>

					<div class="h-1.5 w-full bg-gray-200">
						<div
							class="h-full transition-all"
							style="width: {Math.round(rate * 100)}%; background-color: var(--section-accent)"
						></div>
					</div>

					<p class="text-sm text-gray-600">
						{hours(data.reading.minutesDone)} of {hours(data.reading.minutesPlanned)} planned.
						{#if data.reading.skipped > 0}
							{data.reading.skipped} skipped.
						{/if}
					</p>
				</div>
			</Card>

			<!-- Where the time went, by category. -->
			<Card title="Where it went" accent="var(--section-accent)">
				<ul class="space-y-2">
					{#each data.reading.byCategory as cat (cat.id ?? 'none')}
						<li class="flex items-center gap-2 text-sm">
							<span
								class="h-3 w-1 shrink-0 rounded-full"
								style="background-color: {cat.color ?? CATEGORY_FALLBACK_COLOR}"
							></span>
							<span class="min-w-0 flex-1 truncate text-gray-700">{cat.name}</span>
							<span class="tabular shrink-0 text-xs text-gray-500">
								{cat.done}/{cat.planned}
							</span>
						</li>
					{/each}
				</ul>
			</Card>

			<!-- Goals that moved. Which is not the same as goals that progressed —
			     a goal's value has no history, so this can only say it was touched. -->
			<Card title="Goals you touched" accent="var(--section-accent)">
				{#if data.goals.length === 0}
					<EmptyState icon="goals" title="No goal moved that week" compact />
				{:else}
					<ul class="space-y-2">
						{#each data.goals as goal (goal.id)}
							<li class="flex items-center gap-2 text-sm">
								<a
									href="/goals#goal-{goal.id}"
									class="min-w-0 flex-1 truncate text-gray-700 hover:text-gray-900 hover:underline"
								>
									{goal.title}
								</a>
								{#if goal.targetValue}
									<span class="tabular shrink-0 text-xs text-gray-500">
										{goal.currentValue}/{goal.targetValue}
										{goal.unit}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		</div>

		<!-- What did not happen, and whether it still needs to. -->
		<Card
			title="What did not happen"
			description="A block that did not happen is gone — next week generates its own. Tick the ones that still need doing and they become todos, with no day on them."
			accent="var(--section-accent)"
			flush
		>
			{#if data.loose.length === 0}
				<EmptyState icon="check" title="Everything you planned, you did" />
			{:else}
				<form method="post" action="?/carry" use:enhance>
					<input type="hidden" name="weekStart" value={data.reading.weekStart} />

					<ul class="divide-y divide-gray-200">
						{#each data.loose as item (item.id)}
							<li>
								<label class="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-gray-50">
									<input
										type="checkbox"
										name="instanceId"
										value={item.id}
										checked={carrying.includes(item.id)}
										onchange={() => toggle(item.id)}
									/>
									<span
										class="h-3 w-1 shrink-0 rounded-full"
										style="background-color: {item.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
									></span>
									<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
									<span class="tabular shrink-0 text-xs text-gray-500">{pretty(item.date)}</span>
									{#if item.status === 'skipped'}
										<span class="shrink-0 text-xs text-gray-500">skipped</span>
									{/if}
								</label>
							</li>
						{/each}
					</ul>

					<div class="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
						<span class="text-xs text-gray-500">
							{#if form?.carried}
								Carried {form.carried} into the todo list.
							{:else}
								{carrying.length} selected
							{/if}
						</span>
						<button type="submit" class="btn btn-primary btn-sm" disabled={carrying.length === 0}>
							Carry into the todo list
						</button>
					</div>
				</form>
			{/if}
		</Card>

		<!--
			Things that never ended.

			Todos, ideas and someday-items only accumulate, and nothing in the app
			had ever asked whether they were still real. This lives in the review
			rather than on a page of its own: a second ritual is a second thing to
			remember, and not remembering is the entire problem.
		-->
		{#if data.stale.length > 0}
			<Card
				title="Still here"
				description="Nobody has touched these in {data.staleMonths} months. Are they real?"
				accent="var(--section-accent)"
				flush
			>
				<ul class="divide-y divide-gray-200">
					{#each data.stale as thing (`${thing.sort}-${thing.id}`)}
						{@const uid = `${thing.sort}-${thing.id}`}
						<li class="flex flex-wrap items-center gap-3 px-4 py-2">
							<span class="chip shrink-0 text-gray-600">{SORT_LABELS[thing.sort]}</span>
							<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{thing.title}</span>
							<span class="tabular shrink-0 text-xs text-gray-500">{thing.since}</span>

							<form method="post" action="?/keepStale" use:enhance class="shrink-0">
								<input type="hidden" name="sort" value={thing.sort} />
								<input type="hidden" name="id" value={thing.id} />
								<button type="submit" class="btn btn-sm">Still real</button>
							</form>

							<!-- Two presses, and the second one is not where the first was:
							     an accidental double-click must never destroy anything. -->
							{#if dropping === uid}
								<form
									method="post"
									action="?/dropStale"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											dropping = null;
										};
									}}
									class="flex shrink-0 items-center gap-2"
								>
									<input type="hidden" name="sort" value={thing.sort} />
									<input type="hidden" name="id" value={thing.id} />
									<!-- Keep comes first, so it is what lands under a cursor that
									     was on the bin. `armed` covers the rest: the confirm is
									     inert until it has been on screen long enough to read. -->
									<button type="button" class="btn btn-sm" onclick={() => (dropping = null)}>
										Keep
									</button>
									<button type="submit" class="btn btn-danger btn-sm" use:armed>
										Delete it?
									</button>
								</form>
							{:else}
								<button
									type="button"
									class="btn btn-sm shrink-0"
									onclick={() => (dropping = uid)}
									title="Let it go"
									aria-label="Let {thing.title} go"
								>
									<Icon name="trash" size={14} />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</Card>
		{/if}

		<!-- The part worth reading in a year. -->
		<Card
			title="Three lines about the week"
			description="Not a report. The thing you would tell somebody who asked how your week was."
			accent="var(--section-accent)"
		>
			<form method="post" action="?/saveLines" use:enhance class="space-y-2">
				<input type="hidden" name="weekStart" value={data.reading.weekStart} />

				{#each { length: data.linesPerReview }, i (i)}
					<input
						type="text"
						name="line"
						value={lineAt(i + 1)}
						maxlength="500"
						placeholder={i === 0
							? 'What went well'
							: i === 1
								? 'What did not'
								: 'What you will do differently'}
						class="input w-full"
					/>
				{/each}

				<div class="flex justify-end">
					<button type="submit" class="btn btn-primary btn-sm" title="Save" aria-label="Save">
						<Icon name="check" size={16} />
					</button>
				</div>
			</form>
		</Card>
	{/if}
</div>
