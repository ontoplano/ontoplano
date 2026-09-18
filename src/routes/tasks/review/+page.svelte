<script lang="ts">
	import type { PlainKey } from '$lib/i18n/keys';
	import { enhance } from '$app/forms';
	import PeriodNav from '$lib/components/PeriodNav.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import Card from '$lib/components/Card.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { armed } from '$lib/actions/armed';
	import { useT } from '$lib/i18n';

	const t = useT();

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

	function hours(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return t('tasks.review.minutesAbbrev', { count: m });
		if (m === 0) return t('tasks.review.hoursAbbrev', { count: h });
		return t('tasks.review.hoursMinutesAbbrev', { hours: h, minutes: m });
	}

	function pretty(dateStr: string): string {
		return new Date(dateStr + 'T00:00:00').toLocaleDateString(t.locale, {
			month: 'short',
			day: 'numeric'
		});
	}

	/** The stale row whose "let it go" has been armed. Nothing deletes on one press. */
	let dropping = $state<string | null>(null);

	const SORT_LABELS: Record<string, PlainKey> = {
		todo: 'tour.toDo',
		idea: 'fields.idea.heading',
		inventory: 'tasks.review.someday'
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
						label: new Date(item.date + 'T00:00:00').toLocaleDateString(t.locale, {
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
	<PeriodNav
		unit={t('tasks.plan.week')}
		nowLabel={t('tasks.review.thisWeek')}
		atNow={data.week.isCurrent}
		onprev={() =>
			// The route is resolved; the rule cannot see through the query string.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(`${resolve('/tasks/review')}?week=${data.week.prev}`)}
		onnext={() =>
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(`${resolve('/tasks/review')}?week=${data.week.next}`)}
	>
		<h2 class="text-base font-semibold text-gray-900">
			{t('tasks.review.week', { number: data.week.number, year: data.week.year })}
		</h2>
		<p class="truncate text-sm text-gray-500">
			{pretty(data.reading.weekStart)} — {pretty(data.reading.weekEnd)}
			{#if data.week.isCurrent}
				{t('tasks.review.stillRunning')}
			{/if}
		</p>
	</PeriodNav>

	{#if data.reading.planned === 0}
		<div class="border border-gray-200 bg-white shadow-card">
			<EmptyState
				icon="calendar"
				title={t('tasks.review.nothingWasPlannedThatWeek')}
				description={t('tasks.review.aReviewNeedsAWeek')}
			/>
		</div>
	{:else}
		<div class="grid gap-4 lg:grid-cols-3">
			<!-- What you planned against what you did. -->
			<Card title={t('tasks.review.theWeek')} accent="var(--section-accent)">
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
						{hours(data.reading.minutesDone)}
						{t('tasks.review.of')}
						{hours(data.reading.minutesPlanned)}
						{t('tasks.review.planned')}
						{#if data.reading.skipped > 0}
							{data.reading.skipped} {t('tasks.review.skipped2')}
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

			<!-- Where the time went, by category. -->
			<Card title={t('tasks.review.whereItWent')} accent="var(--section-accent)">
				<ul class="space-y-2">
					{#each data.reading.byCategory as cat (cat.id ?? 'none')}
						<li class="flex items-center gap-2 text-sm">
							<Swatch color={cat.color ?? CATEGORY_FALLBACK_COLOR} />
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
			<Card title={t('tasks.review.goalsYouTouched')} accent="var(--section-accent)">
				{#if data.goals.length === 0}
					<EmptyState
						icon="goals"
						title={data.week.isCurrent
							? t('tasks.review.noGoalMovedYet')
							: t('tasks.review.noGoalMovedThatWeek')}
						compact
					/>
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
								{#each goal.targets as target (target.unit + target.targetValue)}
									<span class="tabular shrink-0 text-xs text-gray-500">
										{target.currentValue}/{target.targetValue}
										{target.unit}
									</span>
								{/each}
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		</div>

		<!-- What did not happen, and whether it still needs to. -->
		<Card
			title={t('tasks.review.whatDidNotHappen')}
			description={t('tasks.review.sayWhatHappenedToEach')}
			accent="var(--section-accent)"
			flush
		>
			<!--
				How many answers are waiting to be written, at the top where the
				answering happens — the pile they land in is at the bottom of a
				long list and easy to miss entirely.

				Drawn on every render and made invisible when the count is zero,
				never added and removed: appearing would push the first row down
				under the finger about to press it.
			-->
			{#snippet actions()}
				<button
					type="button"
					class="btn btn-sm {decided.length === 0 ? 'invisible' : ''}"
					aria-hidden={decided.length === 0}
					tabindex={decided.length === 0 ? -1 : 0}
					onclick={() =>
						document
							.getElementById('review-decided')
							?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
					>{t('tasks.review.toCommit', {
						length: decided.length,
						answers: decided.length === 1 ? 'answer' : 'answers'
					})}</button
				>
			{/snippet}
			{#if data.loose.length === 0}
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
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="min-w-0" data-tour="review-loose">
						{#if undecided.length === 0}
							<p class="px-4 py-6 text-center text-sm text-gray-500">
								{t('tasks.review.everyOneOfThemHas')}
							</p>
						{/if}
						{#each looseByDay as day (day.date)}
							<div class="eyebrow border-y border-gray-200 bg-gray-50 px-4 py-1.5 text-gray-600">
								{day.label}
							</div>
							<ul class="divide-y divide-gray-200">
								{#each day.items as item (item.id)}
									<li class="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
										<Swatch color={item.categoryColor ?? CATEGORY_FALLBACK_COLOR} />
										<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
										<span class="tabular shrink-0 text-xs text-gray-500">{pretty(item.date)}</span>

										<!-- Icons alone: four words on every row of twenty is a wall. -->
										<div class="flex shrink-0 items-center gap-1">
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
						class="mt-6 min-w-0 border-t border-gray-200 lg:mt-0 lg:border-t-0 lg:border-l"
					>
						<input type="hidden" name="weekStart" value={data.reading.weekStart} />

						<!--
							A header, not another weekday.

							This is the other half of the screen — on a wide one it is the
							right-hand column — and stacked under Sunday it wore exactly
							the band a day wears, so it read as one more day of the week
							with a strange name. It takes the card's own header treatment
							instead: the section's tint, a rule in the section's colour
							above it, and a sentence saying what the pile is for.
						-->
						<div
							class="section-tint border-y border-gray-200 px-4 py-3"
							style="border-top: 2px solid var(--section-accent)"
						>
							<h3 class="eyebrow text-gray-600">{t('tasks.review.whatYouHaveDecided')}</h3>
							<p class="mt-1 text-sm text-gray-500">
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
									<li class="flex items-center gap-3 px-4 py-2">
										<input
											type="hidden"
											name="verdict"
											value="{item.id}:{item.verb}{item.on ? `:${item.on}` : ''}"
										/>
										<Swatch color={item.categoryColor ?? CATEGORY_FALLBACK_COLOR} />
										<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
										<span class="shrink-0 text-xs font-medium text-gray-600">
											{t(VERB_LABELS[item.verb])}{item.on ? ` · ${pretty(item.on)}` : ''}
										</span>
										<button
											type="button"
											onclick={() => undecide(item.id)}
											class="icon-btn shrink-0"
											title={t('tasks.review.putItBackNothing')}
											aria-label={t('tasks.review.undoTheAnswerFor', { title: item.title })}
										>
											<Icon name="undo" />
										</button>
									</li>
								{/each}
							</ul>

							<div
								class="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3"
							>
								<span class="text-xs text-gray-500"
									>{t('tasks.review.noneOfThem', {
										length: decided.length,
										answers: decided.length === 1 ? 'answer' : 'answers'
									})}</span
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
										<Icon name="check" size={14} />
										{t('ui.done')}
									</button>
								</form>
							{/if}

							<form method="post" action="?/keepStale" use:enhance class="shrink-0">
								<input type="hidden" name="sort" value={thing.sort} />
								<input type="hidden" name="id" value={thing.id} />
								<button type="submit" class="btn btn-sm">{t('tasks.review.stillReal')}</button>
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
										{t('tasks.review.keep')}
									</button>
									<button type="submit" class="btn btn-danger btn-sm" use:armed>
										{t('tasks.review.deleteIt')}
									</button>
								</form>
							{:else}
								<button
									type="button"
									class="btn btn-sm shrink-0"
									onclick={() => (dropping = uid)}
									title={t('tasks.review.letItGo')}
									aria-label={t('tasks.review.letGo', { title: thing.title })}
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
			title={t('tasks.review.notesAboutTheWeek')}
			description={t('tasks.review.writeSomethingAboutHowThis')}
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
				<a href={resolve('/notebooks/weekly')} class="btn btn-sm"
					>{t('tasks.review.seeWhatIWroteBefore')}</a
				>
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
			<!--
				Written prose is read, not edited.

				The box used to sit open for ever with the note inside it, which is
				a form where a paragraph should be — and after a save the textarea
				kept whatever the DOM had rather than what was stored, so it was
				never quite clear what the week actually said. A written note is
				its own rendering now, with a pencil; an empty week opens straight
				into the box, because there is nothing to read yet.
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
					<textarea
						id="week-note"
						name="note"
						rows="6"
						autocomplete="off"
						placeholder={t('tasks.review.whatWentWellWhatDid')}
						class="input w-full resize-y"
						maxlength={8000}
						bind:value={noteDraft}
					></textarea>

					<div class="flex items-center justify-end gap-3">
						{#if form?.saved}
							<span class="text-xs text-gray-500">{t('tasks.review.saved')}</span>
						{/if}
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
						<button
							type="submit"
							class="btn btn-primary btn-sm"
							title={t('ui.save')}
							aria-label={t('ui.save')}
						>
							<Icon name="check" size={16} />
						</button>
					</div>
				</form>
			{/if}
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
		title={t('tasks.review.giveItADay')}
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
			<label class="block text-sm text-gray-700" for="give-a-day"
				>{t('tasks.review.onWhichDay')}</label
			>
			<input
				id="give-a-day"
				type="date"
				required
				autocomplete="off"
				bind:value={chosenDay}
				title={t('tasks.review.theDayItShouldBe')}
				class="input w-full"
			/>
			<div class="flex justify-end">
				<button
					type="submit"
					class="btn btn-primary btn-sm"
					title={t('tasks.review.putItOnThatDay')}
				>
					{t('tasks.review.putItOnThatDay')}
				</button>
			</div>
		</form>
	</Modal>
</div>
