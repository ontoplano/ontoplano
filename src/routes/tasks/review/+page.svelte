<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import { sliding } from '$lib/actions/sliding';
	import { dayOf, weekdayOf } from '$lib/when';
	import type { PlainKey } from '$lib/i18n/keys';
	import { enhance } from '$lib/enhance';
	import PeriodNav from '$lib/components/PeriodNav.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import Pie from '$lib/components/Pie.svelte';
	import { formatDuration } from '$lib/duration';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import Card from '$lib/components/Card.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { getAction } from '$lib/shortcuts';
	import Modal from '$lib/components/Modal.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { armed } from '$lib/actions/armed';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/*
	 * The week's note: read by default, edited on purpose.
	 *
	 * The draft is its own state rather than the textarea's DOM value, so
	 * what is on screen after a save is what was stored and not what the
	 * browser happened to keep.
	 */
	let editingNote = $state(false);
	let noteDraft = $state('');
	$effect(() => {
		// A different week is a different note; leave whatever is being typed
		// alone while the box is open.
		if (!editingNote) noteDraft = data.note;
	});

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

	const VERB_LABELS: Record<Verb, PlainKey> = {
		done: 'tasks.plan.itHappened',
		skipped: 'home.skipped',
		todo: 'tasks.review.onTheTodoList'
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

	const ROOM = '/tasks/review';

	function toWeek(week: string) {
		// The route is resolved; the rule cannot see through the query string.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve(ROOM)}?week=${week}`);
	}

	/* `[` and `]` step the week, as PeriodNav's tooltips promise. */
	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement ||
			(e.target instanceof HTMLElement && e.target.isContentEditable)
		)
			return;
		const action = getAction(ROOM, e.key);
		if (action === 'prev-week') toWeek(data.week.prev);
		else if (action === 'next-week') toWeek(data.week.next);
		else return;
		e.preventDefault();
	}

	function pretty(dateStr: string): string {
		return dayOf(dateStr, now());
	}

	/** The stale row whose "let it go" has been armed. Nothing deletes on one press. */
	let dropping = $state<string | null>(null);

	const SORT_LABELS: Record<string, PlainKey> = {
		todo: 'tour.toDo',
		idea: 'fields.idea.heading',
		inventory: 'tasks.review.someday'
	};

	/**
	 * Which third of the week this panel is showing.
	 *
	 * Two cards, one above the other, was the first shape and the wrong one:
	 * the same block appeared in both as you answered for it, and reading "what
	 * I did" meant scrolling past "what I did not". One panel, one place, and a
	 * toggle in its header — which is the part that must not move when it is
	 * pressed.
	 *
	 * Three rather than two, because there are three answers and there were
	 * only ever two lists: a block that was skipped is dealt with, so it leaves
	 * the open questions, and it never happened, so it is not in what did. A
	 * week's worth of "no, not that one" went in and could be read back
	 * nowhere. They are named for the state rather than for the person —
	 * Untold, Done, Skipped — because "you did not" was two of the three.
	 */
	let showing = $state<'untold' | 'done' | 'skipped'>('untold');

	/**
	 * Either half of the week, under the day it belongs to.
	 *
	 * A flat list with a date on the right is a list you have to read twice to
	 * see the shape of: three things on Tuesday and nothing on Thursday is the
	 * useful fact, and it only shows up when the days are headings. Both halves
	 * get it, because they are the same list read two ways.
	 */
	function byDay<T extends { date: string }>(
		items: T[]
	): { date: string; label: string; items: T[] }[] {
		const days: Record<string, { date: string; label: string; items: T[] }> = {};
		for (const item of items) {
			(days[item.date] ??= {
				date: item.date,
				label: weekdayOf(item.date, now(), { weekday: 'long' }),
				items: []
			}).items.push(item);
		}
		return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
	}

	const doneByDay = $derived(byDay(data.done));

	const skippedByDay = $derived(byDay(data.skipped));

	const looseByDay = $derived(byDay(undecided));
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
	One surface, like every other tab of the room: the week's arrows along its
	top, where the plan keeps its own, and the review's sections as panes of
	it with a rule between each rather than cards on the page's ground.
-->
<RoomSurface>
	{#snippet tools()}
		<PeriodNav
			unit={t('tasks.plan.week')}
			nowLabel={t('tasks.review.thisWeek')}
			atNow={data.week.isCurrent}
			onprev={() => toWeek(data.week.prev)}
			onnext={() => toWeek(data.week.next)}
			onnow={() => goto(resolve(ROOM))}
		>
			<h2 class="text-base font-semibold text-gray-900">
				{t('tasks.review.week', { number: String(data.week.number), year: data.week.year })}
			</h2>
			<p class="truncate text-sm text-gray-500">
				{pretty(data.reading.weekStart)} — {pretty(data.reading.weekEnd)}
				{#if data.week.isCurrent}
					{t('tasks.review.stillRunning')}
				{/if}
			</p>
		</PeriodNav>
	{/snippet}

	{#if data.reading.planned === 0}
		<EmptyState
			icon="calendar"
			title={t('tasks.review.nothingWasPlannedThatWeek')}
			description={t('tasks.review.aReviewNeedsAWeek')}
		/>
	{:else}
		<div class="divide-y divide-gray-200">
			<!-- The reading: two panes side by side, one seam between them. -->
			<div class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
				<!-- What you planned against what you did. -->
				<Card title={t('tasks.review.theWeek')} pane>
					<div class="space-y-3">
						<div class="flex items-baseline gap-2">
							<span class="tabular text-3xl font-bold text-gray-900">{data.reading.done}</span>
							<span class="text-sm text-gray-500"
								>{t('tasks.review.ofBlocks', {
									planned: data.reading.planned,
									rate: Math.round(rate * 100)
								})}</span
							>
						</div>

						<div class="h-1.5 w-full bg-gray-200">
							<div
								class="h-full transition-all"
								style="width: {Math.round(rate * 100)}%; background-color: var(--section-accent)"
							></div>
						</div>

						<p class="text-sm text-gray-600">
							{t('tasks.review.timeOfPlanned', {
								done: formatDuration(t, data.reading.minutesDone),
								planned: formatDuration(t, data.reading.minutesPlanned)
							})}
							{#if data.reading.skipped > 0}
								{t('tasks.review.skippedTally', { count: data.reading.skipped })}
							{/if}
						</p>

						<!--
							A week that has not happened yet is not a week you failed.

							Monday morning read as an autopsy: nought of forty-two, nought
							per cent, nothing moved. The numbers are the same; what they
							mean while the week is still running is different, and the
							page says which it is looking at.
						-->
						{#if data.week.isCurrent}
							<p class="text-sm text-gray-500">
								{t('tasks.review.thisWeekIsStillRunning')}
							</p>
						{/if}
					</div>
				</Card>

				<!--
					Where the time went, by category — as a ring, with the list as its
					legend.

					A column of "4/6" per category is a table of two numbers somebody
					has to divide in their head to get the shape of their week. The
					ring is the shape; the middle is the hours it adds up to; the list
					beside it keeps the exact counts, which the ring cannot give.

					Minutes rather than blocks, because the question is where the time
					went and a ten-minute block is not a two-hour one.
				-->
				<Card
					title={t('tasks.review.whereItWent')}
					pane
					class="border-t border-gray-200 lg:border-t-0 lg:border-l"
				>
					<div class="flex flex-wrap items-center gap-5">
						{#if data.reading.minutesDone > 0}
							<Pie
								slices={data.reading.byCategory
									.filter((cat) => cat.minutesDone > 0)
									.map((cat) => ({
										name: cat.name,
										value: cat.minutesDone,
										color: cat.color ?? CATEGORY_FALLBACK_COLOR
									}))}
								label={formatDuration(t, data.reading.minutesDone)}
							/>
						{/if}
						<ul class="min-w-48 flex-1 space-y-2">
							{#each data.reading.byCategory as cat (cat.id ?? 'none')}
								<li class="flex items-center gap-2 text-sm">
									<Swatch color={cat.color ?? CATEGORY_FALLBACK_COLOR} />
									<span class="min-w-0 flex-1 truncate text-gray-700">{cat.name}</span>
									<span class="tabular shrink-0 text-xs text-gray-500">
										{formatDuration(t, cat.minutesDone)} · {cat.done}/{cat.planned}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				</Card>
			</div>

			<!--
				The week, read either way round.

				One panel rather than two cards: "what I did" and "what I did not" are
				the same list answered differently, and as you answer a block it moves
				from one to the other. Two of them meant the same block in both, and
				reading the good half meant scrolling past the other.
			-->
			<Card
				title={{
					untold: t('tasks.review.whatDidNotHappen'),
					done: t('tasks.review.whatHappened'),
					skipped: t('tasks.review.whatYouSkipped')
				}[showing]}
				description={{
					untold: t('tasks.review.sayWhatHappenedToEach'),
					done: t('tasks.review.sayIfOneOfThese'),
					skipped: t('tasks.review.theOnesYouSaidNoTo')
				}[showing]}
				pane
				flush
			>
				<!--
					The toggle lives in the header, which is the part that must not
					move when it is pressed: the lists below differ in length, and
					anything that travels with them would walk out from under the
					finger that just chose.

					How many answers are waiting to be written sits beside it, drawn
					on every render and made invisible when there are none, never
					added and removed: appearing would push the first row down under
					the finger about to press it.
				-->
				{#snippet actions()}
					<button
						type="button"
						class="btn btn-sm {decided.length === 0 || showing !== 'untold' ? 'invisible' : ''}"
						aria-hidden={decided.length === 0}
						tabindex={decided.length === 0 || showing !== 'untold' ? -1 : 0}
						onclick={() =>
							document
								.getElementById('review-decided')
								?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
						>{t('tasks.review.answersToSave', { count: decided.length })}</button
					>
					<div use:sliding class="seg" role="group" aria-label={t('tasks.review.whichHalf')}>
						<button
							type="button"
							onclick={() => (showing = 'untold')}
							aria-pressed={showing === 'untold'}
							>{t('tasks.review.untold', { count: data.loose.length })}</button
						>
						<button
							type="button"
							onclick={() => (showing = 'done')}
							aria-pressed={showing === 'done'}
							>{t('tasks.review.done', { count: data.done.length })}</button
						>
						<button
							type="button"
							onclick={() => (showing = 'skipped')}
							aria-pressed={showing === 'skipped'}
							>{t('tasks.review.skippedCount', { count: data.skipped.length })}</button
						>
					</div>
				{/snippet}
				{#if showing === 'done'}
					{#if data.done.length === 0}
						<EmptyState icon="check" title={t('tasks.review.nothingIsTickedOffYet')} />
					{:else}
						<!--
							The same rows as the other half, with the one answer this half
							needs: it did not actually happen. That sends it back to the open
							questions rather than straight to skipped, because the four
							ordinary answers are over there — including the one that makes a
							todo out of it.
						-->
						{#each doneByDay as day (day.date)}
							{@render dayBand(day)}
							<ul class="divide-y divide-gray-200">
								{#each day.items as item (item.id)}
									<li class="list-row">
										{@render blockName(item)}
										<div class="list-row-actions">
											<span class="tabular mr-2 text-xs text-gray-500"
												>{formatDuration(t, item.minutes)}</span
											>
											<form method="post" action="?/reopen" use:enhance>
												<input type="hidden" name="instanceId" value={item.id} />
												<button
													class="icon-btn"
													title={t('tasks.review.itDidNotActuallyHappen')}
													aria-label={t('tasks.review.itDidNotActually', { title: item.title })}
												>
													<Icon name="undo" />
												</button>
											</form>
										</div>
									</li>
								{/each}
							</ul>
						{/each}
					{/if}
				{:else if showing === 'skipped'}
					<!--
						What you said no to, read back. No answer on the row: a skipped
						block has been answered, and changing your mind about one is the
						same act as changing your mind about a done one — it goes back to
						the open questions, where all four answers live.
					-->
					{#if data.skipped.length === 0}
						<EmptyState icon="check" title={t('tasks.review.nothingWasSkipped')} />
					{:else}
						{#each skippedByDay as day (day.date)}
							{@render dayBand(day)}
							<ul class="divide-y divide-gray-200">
								{#each day.items as item (item.id)}
									<li class="list-row">
										{@render blockName(item)}
										<div class="list-row-actions">
											<form method="post" action="?/reopen" use:enhance>
												<input type="hidden" name="instanceId" value={item.id} />
												<button
													class="icon-btn"
													title={t('tasks.review.askAboutItAgain')}
													aria-label={t('tasks.review.askAboutTitleAgain', { title: item.title })}
												>
													<Icon name="undo" />
												</button>
											</form>
										</div>
									</li>
								{/each}
							</ul>
						{/each}
					{/if}
				{:else if data.loose.length === 0}
					<EmptyState icon="check" title={t('tasks.review.everythingYouPlannedYouDid')} />
				{:else}
					<!--
						Two columns: what is left, and what you have decided about.

						The answer used to be applied the moment you pressed it — twenty
						blocks was twenty round trips, and a misclick was already done. A
						row you answer now moves across into a pile you can read back and
						change your mind about, and nothing is written until you commit
						the lot.
					-->
					<div class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
						<div class="min-w-0" data-tour="review-loose">
							{#if undecided.length === 0}
								<p class="px-4 py-6 text-center text-sm text-gray-500">
									{t('tasks.review.everyOneOfThemHas')}
								</p>
							{/if}
							{#each looseByDay as day (day.date)}
								{@render dayBand(day)}
								<ul class="divide-y divide-gray-200">
									{#each day.items as item (item.id)}
										<li class="list-row">
											{@render blockName(item)}
											<!-- Icons alone: four words on every row of twenty is a wall. -->
											<div class="list-row-actions">
												<button
													type="button"
													onclick={() => decide(item.id, 'done')}
													class="icon-btn"
													title={t('tasks.review.itHappenedAfterAll')}
													aria-label={t('tasks.review.itHappenedAfter', { title: item.title })}
												>
													<Icon name="check" />
												</button>
												<button
													type="button"
													onclick={() => decide(item.id, 'skipped')}
													class="icon-btn"
													title={t('tasks.review.itDidNotHappen')}
													aria-label={t('tasks.review.skipped', { title: item.title })}
												>
													<Icon name="skip" />
												</button>
												<button
													type="button"
													onclick={() => decide(item.id, 'todo')}
													class="icon-btn"
													title={t('tasks.review.itStillNeedsDoing')}
													aria-label={t('tasks.review.ontoTheTodo', { title: item.title })}
												>
													<Icon name="archive" />
												</button>
												<button
													type="button"
													onclick={() => (givingADay = { id: item.id, title: item.title })}
													class="icon-btn"
													title={t('tasks.review.itStillNeedsDoing2')}
													aria-label={t('tasks.review.giveItA', { title: item.title })}
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
							id="review-decided"
							class="min-w-0 border-t border-gray-200 lg:border-t-0 lg:border-l"
						>
							<input type="hidden" name="weekStart" value={data.reading.weekStart} />

							<!--
								A header, not another weekday.

								This is the other half of the screen — on a wide one it is the
								right-hand column — and stacked under Sunday it wore exactly
								the band a day wears, so it read as one more day of the week
								with a strange name. It takes a card header's treatment
								instead, and a sentence saying what the pile is for.
							-->
							<div class="section-tint card-header border-y border-gray-200 lg:border-t-0">
								<h3 class="eyebrow text-gray-600">{t('tasks.review.whatYouHaveDecided')}</h3>
								<p class="mt-1.5 text-sm text-gray-500">
									{t('tasks.review.nothingHereHasHappenedYet')}
								</p>
							</div>

							{#if decided.length === 0}
								<p class="px-4 py-6 text-center text-sm text-gray-500">
									{t('tasks.review.answerOneAndItMoves')}
								</p>
							{:else}
								<ul class="divide-y divide-gray-200">
									{#each decided as item (item.id)}
										<li class="list-row">
											<input
												type="hidden"
												name="verdict"
												value="{item.id}:{item.verb}{item.on ? `:${item.on}` : ''}"
											/>
											{@render blockName(item)}
											<div class="list-row-actions">
												<span class="mr-2 text-xs font-medium text-gray-600">
													{t(VERB_LABELS[item.verb])}{item.on ? ` · ${pretty(item.on)}` : ''}
												</span>
												<button
													type="button"
													onclick={() => undecide(item.id)}
													class="icon-btn"
													title={t('tasks.review.putItBackNothing')}
													aria-label={t('tasks.review.undoTheAnswerFor', { title: item.title })}
												>
													<Icon name="undo" />
												</button>
											</div>
										</li>
									{/each}
								</ul>

								<div
									class="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3"
								>
									<span class="text-xs text-gray-500"
										>{t('tasks.review.answersNotWritten', { count: decided.length })}</span
									>
									<button
										type="submit"
										class="btn btn-primary btn-sm"
										title={t('tasks.review.applyEveryAnswer')}
									>
										{t('ui.save')}
									</button>
								</div>
							{/if}
						</form>
					</div>

					{#if form?.settled}
						<p class="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
							{t('tasks.review.settled', { settled: form.settled })}
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
					title={t('tasks.review.stillHere')}
					description={t('tasks.review.nobodyHasTouchedThese', { months: data.staleMonths })}
					pane
					flush
				>
					<ul class="divide-y divide-gray-200">
						{#each data.stale as thing (`${thing.sort}-${thing.id}`)}
							{@const uid = `${thing.sort}-${thing.id}`}
							<li class="list-row">
								<div class="list-row-main">
									<p class="truncate text-sm text-gray-900">{thing.title}</p>
									<p class="text-xs text-gray-500">
										{t(SORT_LABELS[thing.sort])} · <span class="tabular">{thing.since}</span>
									</p>
								</div>

								<div class="list-row-actions">
									{#if dropping === uid}
										<!-- Two presses, and the second one is not where the first
										     was: Keep lands under a cursor that was on the bin, and
										     `armed` keeps the confirm inert until it can be read. -->
										<form
											method="post"
											action="?/dropStale"
											use:enhance={() => {
												return async ({ update }) => {
													await update({ reset: false });
													dropping = null;
												};
											}}
											class="flex items-center gap-2"
										>
											<input type="hidden" name="sort" value={thing.sort} />
											<input type="hidden" name="id" value={thing.id} />
											<button type="button" class="btn btn-sm" onclick={() => (dropping = null)}>
												{t('tasks.review.keep')}
											</button>
											<button type="submit" class="btn btn-danger btn-sm" use:armed>
												{t('tasks.review.deleteIt')}
											</button>
										</form>
									{:else}
										<!-- Half of what has sat here for three months is not
										     undecided, it is finished and never ticked. Only a
										     todo has a done state; the others keep its place. -->
										<form
											method="post"
											action="?/completeStale"
											use:enhance
											class={thing.sort === 'todo' ? '' : 'invisible'}
											inert={thing.sort !== 'todo'}
										>
											<input type="hidden" name="sort" value={thing.sort} />
											<input type="hidden" name="id" value={thing.id} />
											<button
												type="submit"
												class="icon-btn"
												title={t('ui.done')}
												aria-label={t('ui.done')}
											>
												<Icon name="check" />
											</button>
										</form>
										<form method="post" action="?/keepStale" use:enhance>
											<input type="hidden" name="sort" value={thing.sort} />
											<input type="hidden" name="id" value={thing.id} />
											<button
												type="submit"
												class="icon-btn"
												title={t('tasks.review.stillReal')}
												aria-label={t('tasks.review.stillReal')}
											>
												<Icon name="pin" />
											</button>
										</form>
										<button
											type="button"
											class="icon-btn icon-btn-danger"
											onclick={() => (dropping = uid)}
											title={t('tasks.review.letItGo')}
											aria-label={t('tasks.review.letGo', { title: thing.title })}
										>
											<Icon name="trash" />
										</button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</Card>
			{/if}

			<!-- The part worth reading in a year. -->
			<Card
				title={t('tasks.review.notesAboutTheWeek')}
				description={t('tasks.review.writeSomethingAboutHowThis')}
				pane
			>
				<!--
					Where the rest of them live.

					Every week ever written used to be printed under this card, which put
					two months of writing between the box and the bottom of the page for
					no reason: they already have a room of their own in the notebooks,
					and one line pointing at it is the whole job.
				-->
				{#snippet actions()}
					<a href={resolve('/notebooks/weekly')} class="btn btn-sm"
						>{t('tasks.review.seeWhatIWroteBefore')}</a
					>
				{/snippet}
				<!--
					One box, not three.

					It was three inputs labelled "what went well", "what did not" and
					"what you will do differently" — a form, in the place meant for the
					one part of a review that is writing. The three are the placeholder
					now, which is what they always were: a suggestion of what to write
					about.

					Written prose is read, not edited: a written note is its own
					rendering, with a pencil; an empty week opens straight into the
					box, because there is nothing to read yet.
				-->
				{#if data.note && !editingNote}
					<div class="flex items-start gap-3">
						<!-- `renderMarkdown` escapes every character of the input before it
						     emits a tag, and emits only attributes it writes itself. See
						     `$lib/markdown.ts`. -->
						<div class="md min-w-0 flex-1 text-sm text-gray-900">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html renderMarkdown(data.note)}
						</div>
						<button
							class="icon-btn shrink-0"
							title={t('tasks.review.editTheNote')}
							aria-label={t('tasks.review.editTheNote')}
							onclick={() => {
								noteDraft = data.note;
								editingNote = true;
							}}
						>
							<Icon name="edit" />
						</button>
					</div>
				{:else}
					<form
						method="post"
						action="?/saveNote"
						class="space-y-2"
						data-tour="review-lines"
						use:enhance={() =>
							({ update }) => {
								editingNote = false;
								return update({ reset: false });
							}}
					>
						<input type="hidden" name="weekStart" value={data.reading.weekStart} />

						<label class="sr-only" for="week-note">{t('tasks.review.notesAboutTheWeek')}</label>
						<!--
							Bound, not printed into the markup: a textarea whose value is its
							child text keeps the browser's copy after a save, and what is
							stored and what is shown drift apart from there.
						-->
						<MarkdownBox
							id="week-note"
							name="note"
							rows={6}
							placeholder={t('tasks.review.whatWentWellWhatDid')}
							maxlength={8000}
							bind:value={noteDraft}
						/>

						<div class="flex items-center justify-end gap-2">
							<span class="text-xs text-gray-500 {form?.saved ? '' : 'invisible'}"
								>{t('tasks.review.saved')}</span
							>
							{#if data.note}
								<button
									type="button"
									class="btn btn-sm"
									onclick={() => {
										noteDraft = data.note;
										editingNote = false;
									}}
								>
									{t('ui.cancel')}
								</button>
							{/if}
							<button type="submit" class="btn btn-primary btn-sm">
								{t('ui.save')}
							</button>
						</div>
					</form>
				{/if}
			</Card>
		</div>
	{/if}
</RoomSurface>

<!-- A day's band: the weekday and its date, so the rows under it need neither. -->
{#snippet dayBand(day: { date: string; label: string })}
	<div
		class="eyebrow border-b border-gray-200 bg-gray-50 px-4 py-1.5 text-gray-600 not-first:border-t"
	>
		{day.label} · {pretty(day.date)}
	</div>
{/snippet}

<!-- A block's name, with its category's colour beside it. -->
{#snippet blockName(item: { title: string; categoryColor: string | null })}
	<div class="list-row-main flex items-center gap-3">
		<Swatch color={item.categoryColor ?? CATEGORY_FALLBACK_COLOR} />
		<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
	</div>
{/snippet}

<!--
	Giving something a day.

	The block did not happen and still needs to, on a date you can name — so
	it becomes a todo with that date on it, which is the difference between
	putting a thing off and deciding when to do it. Like every other answer
	here it is only a decision until the week is saved.
-->
<Modal
	open={givingADay !== null}
	title={t('tasks.review.giveItADay')}
	description={givingADay?.title ?? ''}
	size="sm"
	onclose={() => {
		givingADay = null;
		chosenDay = '';
	}}
>
	<form
		id="give-a-day-form"
		onsubmit={(e) => {
			e.preventDefault();
			if (givingADay && chosenDay) decide(givingADay.id, 'todo', chosenDay);
			givingADay = null;
			chosenDay = '';
		}}
	>
		<FormGrid>
			<Field label={t('tasks.review.onWhichDay')} span={12} required>
				<input
					id="give-a-day"
					type="date"
					required
					autocomplete="off"
					bind:value={chosenDay}
					title={t('tasks.review.theDayItShouldBe')}
					class="input"
				/>
			</Field>
		</FormGrid>
	</form>
	{#snippet footer()}
		<button
			type="button"
			class="btn"
			onclick={() => {
				givingADay = null;
				chosenDay = '';
			}}>{t('ui.cancel')}</button
		>
		<button type="submit" form="give-a-day-form" class="btn btn-primary">
			{t('tasks.review.putItOnThatDay')}
		</button>
	{/snippet}
</Modal>
