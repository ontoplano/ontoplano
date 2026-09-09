<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import Card from '$lib/components/Card.svelte';
	import Modal from '$lib/components/Modal.svelte';
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

	/**
	 * What you have decided, before any of it is done.
	 *
	 * Answering a row used to apply immediately: twenty blocks was twenty round
	 * trips, and a misclick was a thing that had already happened. Answers land
	 * on the right instead — a pile of decisions you can read back, change your
	 * mind about, and then commit in one press. Nothing is written until you do.
	 */
	type Verb = 'done' | 'skipped' | 'todo';
	// `on` rather than `date`: the block already has a `date` — the day it was
	// planned for — and spreading a verdict over it made "no day chosen" read as
	// the day it did not happen on.
	let verdicts = $state<Record<number, { verb: Verb; on?: string }>>({});

	const VERB_LABELS: Record<Verb, string> = {
		done: 'It happened',
		skipped: 'Skipped',
		todo: 'On the todo list'
	};

	function decide(id: number, verb: Verb, on?: string) {
		verdicts = { ...verdicts, [id]: on ? { verb, on } : { verb } };
	}

	function undecide(id: number) {
		const rest = { ...verdicts };
		delete rest[id];
		verdicts = rest;
	}

	const decided = $derived(
		data.loose
			.filter((item) => verdicts[item.id])
			.map((item) => ({ ...item, ...verdicts[item.id] }))
	);
	const undecided = $derived(data.loose.filter((item) => !verdicts[item.id]));

	/**
	 * The block being given a day, if any.
	 *
	 * A date field on every row would be twenty date fields; asking for the date
	 * in a dialog keeps the list a list, and opening one moves nothing.
	 */
	let givingADay = $state<{ id: number; title: string } | null>(null);
	let chosenDay = $state('');

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
			undecided.reduce<Record<string, { date: string; label: string; items: typeof data.loose }>>(
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
				goto(`${resolve('/tasks/review')}?week=${data.week.prev}`)}
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
				goto(`${resolve('/tasks/review')}?week=${data.week.next}`)}
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
			description="Say what happened to each. Whichever answer you give, it leaves this list — next week generates its own blocks."
			accent="var(--section-accent)"
			flush
		>
			{#if data.loose.length === 0}
				<EmptyState icon="check" title="Everything you planned, you did" />
			{:else}
				<!--
					Two columns: what is left, and what you have decided about.

					The answer used to be applied the moment you pressed it — twenty
					blocks was twenty round trips, and a misclick was already done. A
					row you answer now moves across into a pile you can read back and
					change your mind about, and nothing is written until you commit
					the lot.
				-->
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="min-w-0" data-tour="review-loose">
						{#if undecided.length === 0}
							<p class="px-4 py-6 text-center text-sm text-gray-500">
								Every one of them has an answer. Save it below.
							</p>
						{/if}
						{#each looseByDay as day (day.date)}
							<div class="eyebrow border-y border-gray-200 bg-gray-50 px-4 py-1.5 text-gray-600">
								{day.label}
							</div>
							<ul class="divide-y divide-gray-200">
								{#each day.items as item (item.id)}
									<li class="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
										<span
											class="h-3 w-1 shrink-0 rounded-full"
											style="background-color: {item.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
										></span>
										<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
										<span class="tabular shrink-0 text-xs text-gray-500">{pretty(item.date)}</span>

										<!-- Icons alone: four words on every row of twenty is a wall. -->
										<div class="flex shrink-0 items-center gap-1">
											<button
												type="button"
												onclick={() => decide(item.id, 'done')}
												class="icon-btn"
												title="It happened after all"
												aria-label="{item.title}: it happened after all"
											>
												<Icon name="check" />
											</button>
											<button
												type="button"
												onclick={() => decide(item.id, 'skipped')}
												class="icon-btn"
												title="It did not happen"
												aria-label="{item.title}: skipped"
											>
												<Icon name="skip" />
											</button>
											<button
												type="button"
												onclick={() => decide(item.id, 'todo')}
												class="icon-btn"
												title="It still needs doing — put it on the todo list"
												aria-label="{item.title}: onto the todo list"
											>
												<Icon name="archive" />
											</button>
											<button
												type="button"
												onclick={() => (givingADay = { id: item.id, title: item.title })}
												class="icon-btn"
												title="It still needs doing — give it a day"
												aria-label="{item.title}: give it a day"
											>
												<Icon name="calendar" />
											</button>
										</div>
									</li>
								{/each}
							</ul>
						{/each}
					</div>

					<!-- The pile of decisions, and the one press that applies them. -->
					<form
						method="post"
						action="?/settle"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
								verdicts = {};
							};
						}}
						class="min-w-0 border-t border-gray-200 lg:border-t-0 lg:border-l"
					>
						<input type="hidden" name="weekStart" value={data.reading.weekStart} />

						<div class="eyebrow border-b border-gray-200 bg-gray-50 px-4 py-1.5 text-gray-600">
							What you have decided
						</div>

						{#if decided.length === 0}
							<p class="px-4 py-6 text-center text-sm text-gray-500">
								Answer one on the left and it moves over here. Nothing is written until you save.
							</p>
						{:else}
							<ul class="divide-y divide-gray-200">
								{#each decided as item (item.id)}
									<li class="flex items-center gap-3 px-4 py-2">
										<input
											type="hidden"
											name="verdict"
											value="{item.id}:{item.verb}{item.on ? `:${item.on}` : ''}"
										/>
										<span
											class="h-3 w-1 shrink-0 rounded-full"
											style="background-color: {item.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
										></span>
										<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
										<span class="shrink-0 text-xs font-medium text-gray-600">
											{VERB_LABELS[item.verb]}{item.on ? ` · ${pretty(item.on)}` : ''}
										</span>
										<button
											type="button"
											onclick={() => undecide(item.id)}
											class="icon-btn shrink-0"
											title="Put it back — nothing has happened yet"
											aria-label="Undo the answer for {item.title}"
										>
											<Icon name="undo" />
										</button>
									</li>
								{/each}
							</ul>

							<div
								class="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3"
							>
								<span class="text-xs text-gray-500">
									{decided.length}
									{decided.length === 1 ? 'answer' : 'answers'}, none of them written yet.
								</span>
								<button type="submit" class="btn btn-primary btn-sm" title="Apply every answer">
									Save
								</button>
							</div>
						{/if}
					</form>
				</div>

				{#if form?.settled}
					<p class="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
						{form.settled} settled.
					</p>
				{/if}
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
			title="Notes about the week"
			description="Write something about how this week went."
			accent="var(--section-accent)"
		>
			<!--
				Where the rest of them live.

				Every week ever written used to be printed under this card, which put
				two months of writing between the box and the bottom of the page for
				no reason: they already have a room of their own in the notebooks,
				and one line pointing at it is the whole job.
			-->
			{#snippet actions()}
				<a href={resolve('/notebooks/weekly')} class="btn btn-sm">See what I wrote before</a>
			{/snippet}
			<!--
				One box, not three.

				It was three inputs labelled "what went well", "what did not" and
				"what you will do differently" — a form, in the place meant for the
				one part of a review that is writing. Somebody with two things to say
				had to invent a third and somebody with a paragraph had nowhere to put
				it. The three are the placeholder now, which is what they always were:
				a suggestion of what to write about.
			-->
			<form
				method="post"
				action="?/saveNote"
				use:enhance
				class="space-y-2"
				data-tour="review-lines"
			>
				<input type="hidden" name="weekStart" value={data.reading.weekStart} />

				<label class="sr-only" for="week-note">Notes about the week</label>
				<textarea
					id="week-note"
					name="note"
					rows="6"
					autocomplete="off"
					placeholder="What went well, what did not, what you will do different…"
					class="input w-full resize-y"
					maxlength={8000}>{data.note}</textarea
				>

				<div class="flex items-center justify-end gap-3">
					{#if form?.saved}
						<span class="text-xs text-gray-500">Saved.</span>
					{/if}
					<button type="submit" class="btn btn-primary btn-sm" title="Save" aria-label="Save">
						<Icon name="check" size={16} />
					</button>
				</div>
			</form>
		</Card>
	{/if}

	<!--
		Giving something a day.

		The block did not happen and still needs to, on a date you can name — so
		it becomes a todo with that date on it, which is the difference between
		putting a thing off and deciding when to do it. Like every other answer
		here it is only a decision until the week is saved.
	-->
	<Modal
		open={givingADay !== null}
		title="Give it a day"
		description={givingADay?.title ?? ''}
		size="sm"
		onclose={() => {
			givingADay = null;
			chosenDay = '';
		}}
	>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				if (givingADay && chosenDay) decide(givingADay.id, 'todo', chosenDay);
				givingADay = null;
				chosenDay = '';
			}}
			class="space-y-3"
		>
			<label class="block text-sm text-gray-700" for="give-a-day">On which day?</label>
			<input
				id="give-a-day"
				type="date"
				required
				autocomplete="off"
				bind:value={chosenDay}
				title="The day it should be done"
				class="input w-full"
			/>
			<div class="flex justify-end">
				<button type="submit" class="btn btn-primary btn-sm" title="Put it on that day">
					Put it on that day
				</button>
			</div>
		</form>
	</Modal>
</div>
