<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import { sliding } from '$lib/actions/sliding';
	import { civilOf, dayOf, rangeOf, weekdayOf } from '$lib/when';
	import type { PlainKey } from '$lib/i18n/keys';
	import { enhance } from '$lib/enhance';
	import PeriodNav from '$lib/components/PeriodNav.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import Pie from '$lib/components/Pie.svelte';
	import { formatDuration } from '$lib/duration';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import type { Snippet } from 'svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { browsable } from '$lib/browse.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import Kbd from '$lib/components/Kbd.svelte';
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
		if (document.querySelector('dialog[open]')) return;
		const action = getAction(ROOM, e.key);
		if (action === 'prev-week') toWeek(data.week.prev);
		else if (action === 'next-week') toWeek(data.week.next);
		else if (!answer(action)) return;
		e.preventDefault();
	}

	/**
	 * The row under the cursor, answered from the keyboard.
	 *
	 * The same four answers the row's buttons give, and on the other two halves
	 * the one they give: back to the open questions. Answering moves the row
	 * across, so the cursor is already on the next one.
	 */
	function answer(action: string | null | undefined): boolean {
		const item = walked[at];
		if (!item || !action) return false;
		if (showing === 'untold') {
			if (action === 'answer-done') decide(item.id, 'done');
			else if (action === 'answer-skipped') decide(item.id, 'skipped');
			else if (action === 'answer-todo') decide(item.id, 'todo');
			else if (action === 'answer-day') givingADay = { id: item.id, title: item.title };
			else return false;
			return true;
		}
		if (action !== 'ask-again') return false;
		(document.getElementById(`reopen-${item.id}`) as HTMLFormElement | null)?.requestSubmit();
		return true;
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

	/*
	 * j/k walk whichever half is showing, in the order it is drawn — day by
	 * day — and h/l step between the halves.
	 */
	const HALVES = ['untold', 'done', 'skipped'] as const;
	type Walked = { date: string; label: string; items: { id: number; title: string }[] };
	const shownByDay: Walked[] = $derived(
		showing === 'untold' ? looseByDay : showing === 'done' ? doneByDay : skippedByDay
	);
	const walked = $derived(shownByDay.flatMap((day) => day.items));
	const place = $derived(new Map(walked.map((item, i) => [item.id, i])));
	let at = $state(-1);

	$effect(() => {
		if (at > walked.length - 1) at = walked.length - 1;
	});

	function showHalf(half: (typeof HALVES)[number]) {
		showing = half;
		at = -1;
	}

	/** The keys this screen answers to, key by word, for the hint under the header. */
	const KEY_HINTS: { keys: string[]; word: PlainKey }[] = [
		{
			keys: [keyFor(ROOM, 'browse-next'), keyFor(ROOM, 'browse-prev')],
			word: 'tasks.review.keyMove'
		},
		{
			keys: [keyFor(ROOM, 'browse-prev-tab'), keyFor(ROOM, 'browse-next-tab')],
			word: 'tasks.review.keyHalf'
		},
		{ keys: [keyFor(ROOM, 'answer-done')], word: 'tasks.review.keyHappened' },
		{ keys: [keyFor(ROOM, 'answer-skipped')], word: 'tasks.review.keySkipped' },
		{ keys: [keyFor(ROOM, 'answer-todo')], word: 'tasks.review.keyTodo' },
		{ keys: [keyFor(ROOM, 'answer-day')], word: 'tasks.review.keyDay' },
		{ keys: [keyFor(ROOM, 'ask-again')], word: 'tasks.review.keyAskAgain' }
	];

	browsable(() => ({
		items: () => walked,
		cursor: () => at,
		moveTo: (i) => (at = i),
		tabs: {
			of: HALVES,
			current: () => showing,
			go: (half) => showHalf(half as (typeof HALVES)[number])
		}
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
	One surface, like every other tab of the room: the week's arrows along its
	top, where the plan keeps its own, and the review's parts as sections of it
	with a rule between each.

	The sections are headed in the surface's own white rather than a tinted
	band each: four bands down one page read as four cards stacked on a
	coloured ground, which is chrome competing with the categories.

	On a phone the part that needs doing comes first. The reading above it was
	a screen and a half of numbers before the first question.
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
			<span class="block truncate text-sm text-gray-700">
				{rangeOf(data.reading.weekStart, data.reading.weekEnd, now())}
			</span>
		</PeriodNav>
	{/snippet}

	{#if data.reading.planned === 0}
		<EmptyState
			icon="calendar"
			title={t('tasks.review.nothingWasPlannedThatWeek')}
			description={t('tasks.review.aReviewNeedsAWeek')}
		/>
	{:else}
		<div class="-mb-px flex flex-col">
			<!-- The reading: two panes side by side, one seam between them. -->
			<div
				class="order-1 grid grid-cols-[minmax(0,1fr)] border-b border-gray-200 lg:order-none lg:grid-cols-2"
			>
				<!-- What you planned against what you did. -->
				<section class="min-w-0">
					{@render head(
						t('tasks.review.week', { number: String(data.week.number), year: data.week.year })
					)}
					<div class="space-y-3 px-4 pb-4">
						<div class="flex items-baseline gap-2">
							<span class="tabular text-3xl font-bold text-gray-900">{data.reading.done}</span>
							<span class="text-sm text-gray-500"
								>{t('tasks.review.ofBlocks', {
									planned: data.reading.planned,
									rate: Math.round(rate * 100)
								})}</span
							>
						</div>

						<div class="progress-track h-1.5 w-full">
							<div
								class="progress-fill h-full transition-all"
								style="width: {Math.round(rate * 100)}%"
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
				</section>

				<!--
					Where the time went, by category — as a ring, with the list as its
					legend.

					Minutes rather than blocks, because the question is where the time
					went and a ten-minute block is not a two-hour one. The legend is as
					wide as its longest line, so a value sits beside its label rather
					than across the pane from it.
				-->
				<section class="min-w-0 border-t border-gray-200 lg:border-t-0 lg:border-l">
					{@render head(t('tasks.review.whereItWent'))}
					<div
						class="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4 pb-4 sm:justify-start"
					>
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
						<ul class="grid w-fit grid-cols-[auto_auto] items-center gap-x-6 gap-y-2">
							{#each data.reading.byCategory as cat (cat.id ?? 'none')}
								<li class="contents text-sm">
									<span class="min-w-0"><CategoryMark name={cat.name} color={cat.color} /></span>
									<span class="tabular text-right text-xs text-gray-500">
										{formatDuration(t, cat.minutesDone)} · {cat.done}/{cat.planned}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				</section>
			</div>

			<!--
				The week, read either way round.

				One panel rather than two cards: "what I did" and "what I did not" are
				the same list answered differently, and as you answer a block it moves
				from one to the other.
			-->
			<section class="min-w-0 border-b border-gray-200">
				<!--
					The toggle lives in the header, which is the part that must not
					move when it is pressed: the lists below differ in length, and
					anything that travels with them would walk out from under the
					finger that just chose.

					How many answers are waiting to be written sits beside it, drawn
					on every render and made invisible when there are none, never
					added and removed.
				-->
				{#snippet halves()}
					<div use:sliding class="seg" role="group" aria-label={t('tasks.review.whichHalf')}>
						<button
							type="button"
							onclick={() => showHalf('untold')}
							aria-pressed={showing === 'untold'}
							>{t('tasks.review.untold', { count: data.loose.length })}</button
						>
						<button type="button" onclick={() => showHalf('done')} aria-pressed={showing === 'done'}
							>{t('tasks.review.done', { count: data.done.length })}</button
						>
						<button
							type="button"
							onclick={() => showHalf('skipped')}
							aria-pressed={showing === 'skipped'}
							>{t('tasks.review.skippedCount', { count: data.skipped.length })}</button
						>
					</div>
					<button
						type="button"
						class="btn btn-sm sm:-order-1 {decided.length === 0 || showing !== 'untold'
							? 'invisible'
							: ''}"
						aria-hidden={decided.length === 0}
						tabindex={decided.length === 0 || showing !== 'untold' ? -1 : 0}
						onclick={() =>
							document
								.getElementById('review-decided')
								?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
						>{t('tasks.review.answersToSave', { count: decided.length })}</button
					>
				{/snippet}
				{@render head(
					{
						untold: t('tasks.review.whatDidNotHappen'),
						done: t('tasks.review.whatHappened'),
						skipped: t('tasks.review.whatYouSkipped')
					}[showing],
					{
						untold: t('tasks.review.sayWhatHappenedToEach'),
						done: t('tasks.review.sayIfOneOfThese'),
						skipped: t('tasks.review.theOnesYouSaidNoTo')
					}[showing],
					halves
				)}
				<!-- The same line on all three halves, so switching moves nothing. -->
				<p
					class="kbd-hint flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-xs text-gray-500"
				>
					{#each KEY_HINTS as hint (hint.word)}
						<span class="inline-flex items-center gap-1 whitespace-nowrap">
							{#each hint.keys as key (key)}<Kbd keys={key} />{/each}
							{t(hint.word)}
						</span>
					{/each}
				</p>
				<div class="border-t border-gray-200">
					{#if showing === 'done'}
						{#if data.done.length === 0}
							<EmptyState icon="check" title={t('tasks.review.nothingIsTickedOffYet')} />
						{:else}
							<!--
								The same rows as the other half, with the one answer this half
								needs: it did not actually happen. That sends it back to the open
								questions rather than straight to skipped, because the four
								ordinary answers are over there.
							-->
							{#each doneByDay as day (day.date)}
								{@render dayBand(day)}
								<ul class="divide-y divide-gray-200">
									{#each day.items as item (item.id)}
										<li class="list-row" use:listCursor={place.get(item.id) === at}>
											{@render blockName(item)}
											<div class="list-row-actions">
												<span class="tabular mr-2 text-xs text-gray-500"
													>{formatDuration(t, item.minutes)}</span
												>
												<form id="reopen-{item.id}" method="post" action="?/reopen" use:enhance>
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
							What you said no to, read back. Changing your mind about one sends
							it back to the open questions, where all four answers live.
						-->
						{#if data.skipped.length === 0}
							<EmptyState icon="check" title={t('tasks.review.nothingWasSkipped')} />
						{:else}
							{#each skippedByDay as day (day.date)}
								{@render dayBand(day)}
								<ul class="divide-y divide-gray-200">
									{#each day.items as item (item.id)}
										<li class="list-row" use:listCursor={place.get(item.id) === at}>
											{@render blockName(item)}
											<div class="list-row-actions">
												<form id="reopen-{item.id}" method="post" action="?/reopen" use:enhance>
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

							A row you answer moves across into a pile you can read back and
							change your mind about, and nothing is written until you commit
							the lot. The pile holds its place beside the list as it scrolls
							rather than stretching to the list's length.
						-->
						<div class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
							<div class="min-w-0 lg:border-r lg:border-gray-200" data-tour="review-loose">
								{#if undecided.length === 0}
									<EmptyState compact icon="check" title={t('tasks.review.everyOneOfThemHas')} />
								{/if}
								{#each looseByDay as day (day.date)}
									{@render dayBand(day)}
									<ul class="divide-y divide-gray-200">
										{#each day.items as item (item.id)}
											<li class="list-row" use:listCursor={place.get(item.id) === at}>
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
														<Icon name="checklist" />
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
								class="min-w-0 self-start border-t border-gray-200 lg:sticky lg:top-4 lg:-ml-px lg:border-t-0 lg:border-l"
							>
								<input type="hidden" name="weekStart" value={data.reading.weekStart} />

								<!--
									A header, not another weekday: stacked under Sunday on a phone
									it wore exactly the band a day wears, and read as one more day
									of the week with a strange name.
								-->
								<div class="border-b border-gray-200">
									{@render head(
										t('tasks.review.whatYouHaveDecided'),
										t('tasks.review.nothingHereHasHappenedYet')
									)}
								</div>

								{#if decided.length === 0}
									<EmptyState compact icon="check" title={t('tasks.review.answerOneAndItMoves')} />
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
				</div>
			</section>

			<!--
				Things that never ended.

				Todos, ideas and someday-items only accumulate, and nothing in the app
				had ever asked whether they were still real. This lives in the review
				rather than on a page of its own: a second ritual is a second thing to
				remember, and not remembering is the entire problem.
			-->
			{#if data.stale.length > 0}
				<section class="min-w-0 border-b border-gray-200">
					{@render head(
						t('tasks.review.stillHere'),
						t('tasks.review.nobodyHasTouchedThese', { months: data.staleMonths })
					)}
					<ul class="divide-y divide-gray-200 border-t border-gray-200">
						{#each data.stale as thing (`${thing.sort}-${thing.id}`)}
							{@const uid = `${thing.sort}-${thing.id}`}
							<li class="list-row">
								<div class="list-row-main">
									<p class="truncate text-sm text-gray-900">{thing.title}</p>
									<p class="text-xs text-gray-500">
										{t(SORT_LABELS[thing.sort])} ·
										<span class="tabular">{civilOf(thing.since, now())}</span>
									</p>
								</div>

								<div class="list-row-actions">
									{#if dropping === uid}
										<!-- Two presses, and the second one is not where the first
											     was: Keep lands under a cursor that was on the bin, and
											     `armed` keeps the confirm inert until it can be read. -->
										<form
											data-leaves
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
				</section>
			{/if}

			<!-- The part worth reading in a year. -->
			<section class="order-2 min-w-0 border-b border-gray-200 lg:order-none">
				{#snippet earlier()}
					<!--
						Where the rest of them live: every week ever written has a room of
						its own in the notebooks, and one line pointing at it is the whole job.
					-->
					<a href={resolve('/notebooks/weekly')} class="btn btn-sm"
						>{t('tasks.review.seeWhatIWroteBefore')}</a
					>
				{/snippet}
				{@render head(
					t('tasks.review.notesAboutTheWeek'),
					t('tasks.review.writeSomethingAboutHowThis'),
					earlier
				)}
				<div class="px-4 pb-4">
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
				</div>
			</section>
		</div>
	{/if}
</RoomSurface>

<!--
	A section's heading, in the surface's own white: its name in small capitals,
	a sentence under it, and whatever acts on it at the right.
-->
{#snippet head(title: string, description = '', actions: Snippet | null = null)}
	<header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3">
		<div class="min-w-0 flex-[1_1_16rem]">
			<h2 class="eyebrow flex min-h-4 items-center text-gray-600">{title}</h2>
			{#if description}
				<p class="mt-1.5 max-w-2xl text-sm text-gray-500">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="ml-auto flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</header>
{/snippet}

<!--
	A day's heading: the weekday and its date, so the rows under it need neither.
	No fill of its own — a filled band was the one thing on the surface darker
	than the surface in the dark theme, so the smallest heading read as the
	loudest.
-->
{#snippet dayBand(day: { date: string; label: string })}
	<div class="eyebrow border-b border-gray-200 px-4 pt-3 pb-1.5 text-gray-500 not-first:border-t">
		{day.label} · {pretty(day.date)}
	</div>
{/snippet}

<!-- A block's name, with its category worn beside it. -->
{#snippet blockName(item: {
	title: string;
	categoryName: string | null;
	categoryColor: string | null;
})}
	<div class="list-row-main flex items-center gap-3">
		<span class="min-w-0 truncate text-sm text-gray-900">{item.title}</span>
		{#if item.categoryName}
			<CategoryMark name={item.categoryName} color={item.categoryColor} />
		{/if}
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
