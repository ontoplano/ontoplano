<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
		todo: 'To-do',
		idea: 'Idea',
		shopping: 'Someday'
	};

	/**
	 * The week's leftovers, under the day they belong to.
	 *
	 * A flat list with a date on the right is a list you have to read twice to
	 * see the shape of: three things on Tuesday and nothing on Thursday is the
	 * useful fact, and it only shows up when the days are headings.
	 */
	const looseByDay = $derived(
		Object.values(
			data.loose.reduce<Record<string, { date: string; label: string; items: typeof data.loose }>>(
				(acc, item) => {
					(acc[item.date] ??= {
						date: item.date,
						label: new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', {
							weekday: 'long'
						}),
						items: []
					}).items.push(item);
					return acc;
				},
				{}
			)
		).sort((a, b) => a.date.localeCompare(b.date))
	);

	function lineAt(position: number): string {
		return data.lines.find((l) => l.position === position)?.content ?? '';
	}
</script>

<div class="space-y-4">
	<!-- ← week → as one block, arrows hugging what they move — the same shape
	     the plan's header has, because they are the same control. -->
	<div class="flex items-center gap-2">
		<button
			class="icon-btn h-11 w-11 shrink-0"
			title="Previous week ([)"
			aria-label="Previous week"
			onclick={() =>
				// The route is resolved; the rule cannot see through the query string.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				goto(`${resolve('/planner/review')}?week=${data.week.prev}`)}
		>
			<Icon name="arrow-left" size={22} />
		</button>

		<div class="min-w-0">
			<h2 class="text-base font-semibold text-gray-900">
				Week {data.week.number}, {data.week.year}
			</h2>
			<p class="truncate text-sm text-gray-500">
				{pretty(data.reading.weekStart)} — {pretty(data.reading.weekEnd)}
				{#if data.week.isCurrent}
					· still running
				{/if}
			</p>
		</div>

		<button
			class="icon-btn h-11 w-11 shrink-0"
			title="Next week (])"
			aria-label="Next week"
			onclick={() =>
				// The route is resolved; the rule cannot see through the query string.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				goto(`${resolve('/planner/review')}?week=${data.week.next}`)}
		>
			<Icon name="arrow-right" size={22} />
		</button>
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
									href="{resolve('/goals')}#goal-{goal.id}"
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
			description="Tick them and say what happened. Whichever answer you give, they leave this list — next week generates its own blocks."
			accent="var(--section-accent)"
			flush
		>
			{#if data.loose.length === 0}
				<EmptyState icon="check" title="Everything you planned, you did" />
			{:else}
				<form method="post" action="?/carry" use:enhance data-tour="review-loose">
					<input type="hidden" name="weekStart" value={data.reading.weekStart} />

					{#each looseByDay as day (day.date)}
						<div class="eyebrow border-y border-gray-200 bg-gray-50 px-4 py-1.5 text-gray-600">
							{day.label}
						</div>
						<ul class="divide-y divide-gray-200">
							{#each day.items as item (item.id)}
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
									</label>
								</li>
							{/each}
						</ul>
					{/each}

					<!--
						Three answers, because there are three.

						Carrying into the todo list was the only one on offer and it is the
						least common: most of what is in this list on a Sunday either
						happened and was never ticked, or was never going to happen and you
						have made your peace with it. One answer made the review a chore
						with one wrong option.
					-->
					<div
						class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3"
					>
						<span class="text-xs text-gray-500">
							{#if form?.carried}
								Carried {form.carried} into the todo list.
							{:else if form?.resolved}
								{form.resolved} settled.
							{:else}
								{carrying.length} selected
							{/if}
						</span>

						<div class="flex flex-wrap items-center gap-2">
							<button
								type="submit"
								formaction="?/resolve"
								name="status"
								value="done"
								class="btn btn-sm"
								disabled={carrying.length === 0}
							>
								<Icon name="check" size={14} /> Done after all
							</button>
							<button
								type="submit"
								formaction="?/resolve"
								name="status"
								value="skipped"
								class="btn btn-sm"
								disabled={carrying.length === 0}
							>
								<Icon name="skip" size={14} /> Skipped
							</button>
							<button type="submit" class="btn btn-primary btn-sm" disabled={carrying.length === 0}>
								Carry into the todo list
							</button>
						</div>
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

							<!-- Half of what has sat here for three months is not undecided,
							     it is finished and never ticked. Only a todo has a done state. -->
							{#if thing.sort === 'todo'}
								<form method="post" action="?/completeStale" use:enhance class="shrink-0">
									<input type="hidden" name="sort" value={thing.sort} />
									<input type="hidden" name="id" value={thing.id} />
									<button type="submit" class="btn btn-sm">
										<Icon name="check" size={14} /> Done
									</button>
								</form>
							{/if}

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
											await update({ reset: false });
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
			<form
				method="post"
				action="?/saveLines"
				use:enhance
				class="space-y-2"
				data-tour="review-lines"
			>
				<input type="hidden" name="weekStart" value={data.reading.weekStart} />

				{#each { length: data.linesPerReview }, i (i)}
					<input
						autocomplete="off"
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
		<!--
			Where the three lines go.

			They were written into a row and never read again unless you happened to
			navigate back to that exact week — and a thing you write and never see is
			a thing you stop writing. This is the running account: the last couple of
			months of weeks, in one place, each linked to its own review.
		-->
		{#if data.past.length > 0}
			<Card
				title="What you wrote before"
				description="The weeks behind this one."
				accent="var(--section-accent)"
				flush
			>
				<ul class="divide-y divide-gray-200">
					{#each data.past as week (week.weekStart)}
						<li class="px-4 py-3">
							<a
								href="{resolve('/planner/review')}?week={week.weekStart}"
								class="tabular text-xs text-gray-500 hover:text-gray-900 hover:underline"
							>
								{pretty(week.weekStart)}
							</a>
							<ul class="mt-1 space-y-0.5">
								{#each week.lines as line, i (i)}
									<li class="text-sm text-gray-900">{line}</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ul>
			</Card>
		{/if}
	{/if}
</div>
