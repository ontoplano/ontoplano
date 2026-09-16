<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { enhance } from '$app/forms';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const active = $derived(data.workouts.filter((w) => !w.archived));
	const archived = $derived(data.workouts.filter((w) => w.archived));

	// One form for new and edit, so the two cannot drift.
	let showForm = $state(false);
	let editing: (typeof data.workouts)[number] | null = $state(null);
	let showArchived = $state(false);
	let confirmingDelete: (typeof data.workouts)[number] | null = $state(null);
	/**
	 * The workout whose plan is open.
	 *
	 * The plan is what somebody reads while doing it, and it used to be
	 * reachable only through Edit — a form is the wrong place to read from,
	 * and one stray keystroke there rewrites the thing you came to consult.
	 */
	let expanded: number | null = $state(null);
	/** The workout being put on a day. */
	let scheduling: (typeof data.workouts)[number] | null = $state(null);

	function todayStr(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	/*
	 * What a workout declares it measures, edited on the workout itself.
	 *
	 * A run is kilometres and a pace; a push day is what was benched and for
	 * how many reps. Naming them here is not recording anything — no value is
	 * given — it is deciding what writing a session down will ask for, so the
	 * common case is already on screen instead of being typed out every week.
	 * A session may still measure anything: this is a suggestion, not a rule.
	 */
	let declared: { activity: string; unit: string }[] = $state([blankDeclared()]);

	function blankDeclared() {
		return { activity: '', unit: '' };
	}

	/** The last row is always empty, so typing into it grows the list. */
	function declaredTyped(index: number) {
		if (index === declared.length - 1 && declared[index].activity.trim() !== '')
			declared.push(blankDeclared());
	}

	function removeDeclared(index: number) {
		declared.splice(index, 1);
		if (declared.length === 0) declared.push(blankDeclared());
	}

	/*
	 * And both directions, because this order is the order the session form
	 * opens in — a run that measures distance before pace asks for them in that
	 * order every week. The lines of a session have no such buttons: their
	 * order is how they were typed on the day, and nothing later reads it.
	 */
	function moveDeclared(index: number, by: number) {
		const to = index + by;
		if (to < 0 || to >= declared.length) return;
		const [row] = declared.splice(index, 1);
		declared.splice(to, 0, row);
	}

	function openNew() {
		editing = null;
		declared = [blankDeclared()];
		showForm = true;
	}
	function openEdit(chosen: (typeof data.workouts)[number]) {
		editing = chosen;
		declared = [...chosen.measures.map((m) => ({ ...m })), blankDeclared()];
		showForm = true;
	}

	let showCategories = $state(false);
	let addingCategory = $state(false);
	let editingCategory = $state<number | null>(null);
	let confirmDeleteCategory = $state<number | null>(null);

	/*
	 * The register: what was actually done, and how much of it.
	 *
	 * "Last done" says whether somebody is keeping a workout up and cannot say
	 * whether they are getting anywhere with it. A session is a day plus lines
	 * of activity, amount and unit in their own words — ran 5 km, deadlifted
	 * 120 kg — so the answer to "am I lifting more than in March" is in the app
	 * rather than in a notebook, and a chart can be drawn over it.
	 */

	type Session = (typeof data.sessions)[number];
	type Line = { activity: string; amount: string; unit: string };

	/** A row nobody has typed in yet. The form always ends with one. */
	const blankLine = (): Line => ({ activity: '', amount: '', unit: '' });

	/** The sessions of one workout, newest first, as the loader ordered them. */
	function sessionsOf(workoutId: number): Session[] {
		return data.sessions.filter((session) => session.workoutId === workoutId);
	}

	/**
	 * Which workout's register is being written, and what is in the form.
	 *
	 * `logging` is the workout; `editingSession` is set as well when an
	 * existing session is being corrected, so the two share one dialog and one
	 * set of rows rather than drifting apart as a "new" and an "edit" form.
	 */
	let logging: (typeof data.workouts)[number] | null = $state(null);
	let editingSession: Session | null = $state(null);
	let logDate = $state(todayStr());
	let logNotes = $state('');
	let lines: Line[] = $state([blankLine()]);
	let confirmDeleteSession: Session | null = $state(null);

	/**
	 * What this workout was measured by last time, with the amounts blank.
	 *
	 * Somebody who logged "ran / km" last week is logging "ran / km" this week,
	 * and typing the word again every time is the friction that stops a
	 * register being kept. Nothing is set up in advance — the second session
	 * learns from the first, and an empty history opens on one empty row.
	 */
	function openingLines(workout: (typeof data.workouts)[number]): Line[] {
		// A plain Set, deliberately: it lives and dies inside this call and
		// nothing renders from it, so there is nothing for a reactive one to
		// notify.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const seen = new Set<string>();
		const out: Line[] = [];

		// What the workout says it measures comes first, in the order it was
		// written there: that list is somebody's answer to "what is this for".
		for (const measure of workout.measures) {
			const key = `${measure.activity} ${measure.unit}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ activity: measure.activity, amount: '', unit: measure.unit });
		}

		// Then anything past sessions measured that the workout never named —
		// somebody who logged a thing twice is likely to log it again.
		for (const session of sessionsOf(workout.id)) {
			for (const measure of session.measures) {
				const key = `${measure.activity} ${measure.unit}`;
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({ activity: measure.activity, amount: '', unit: measure.unit });
			}
		}
		return out.length > 0 ? [...out, blankLine()] : [blankLine()];
	}

	function startLog(workout: (typeof data.workouts)[number]) {
		logging = workout;
		editingSession = null;
		logDate = todayStr();
		logNotes = '';
		lines = openingLines(workout);
	}

	function startEditSession(workout: (typeof data.workouts)[number], session: Session) {
		logging = workout;
		editingSession = session;
		logDate = session.doneOn;
		logNotes = session.notes;
		lines = [
			...session.measures.map((measure) => ({
				activity: measure.activity,
				amount: measure.amount === null ? '' : String(measure.amount),
				unit: measure.unit
			})),
			blankLine()
		];
	}

	function closeLog() {
		logging = null;
		editingSession = null;
	}

	/**
	 * The last row is always empty, so there is nothing to press to add one.
	 *
	 * Typing into the blank row at the bottom grows the list, the way a
	 * spreadsheet does. The explicit "Add a line" button is still there for
	 * a finger on a phone, where noticing that a row appeared below the fold
	 * is not a thing to rely on.
	 */
	function lineTyped(index: number) {
		if (index === lines.length - 1 && lines[index].activity.trim() !== '') lines.push(blankLine());
	}

	function removeLine(index: number) {
		lines.splice(index, 1);
		if (lines.length === 0) lines.push(blankLine());
	}

	/**
	 * The day a session happened, as a person would say it.
	 *
	 * `2026-09-10` is what the database holds, and a column of them is a column
	 * to decode. The year is dropped inside the current one, where it is the
	 * same on every row and says nothing.
	 */
	function dayOf(iso: string): string {
		const day = new Date(`${iso}T00:00:00`);
		if (Number.isNaN(day.getTime())) return iso;
		const thisYear = day.getFullYear() === new Date().getFullYear();
		return day.toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			...(thisYear ? {} : { year: 'numeric' })
		});
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('health.workouts.newWorkout'),
		run: openNew
	}));
</script>

<div class="space-y-4">
	<RoomToolbar>
		{#snippet tools()}
			<button class="btn btn-sm btn-quiet" onclick={() => (showCategories = true)}
				>{t('health.workouts.categories')}</button
			>
			<p class="text-sm text-gray-500">{t('health.workouts.workoutsYouCanDropOnto')}</p>
		{/snippet}
	</RoomToolbar>

	{#if active.length === 0}
		<EmptyState
			icon="health"
			title={t('health.workouts.noWorkoutsYet')}
			description="Write a workout down — a plan and how long it takes — and it is ready to put on a day."
		/>
	{:else}
		<ul class="divide-y divide-gray-100 rounded border border-gray-200">
			{#each active as workout (workout.id)}
				<li class="list-row">
					<button
						class="list-row-main text-left"
						aria-label={t('health.workouts.showThePlanFor', { title: workout.title })}
						aria-expanded={expanded === workout.id}
						onclick={() => (expanded = expanded === workout.id ? null : workout.id)}
					>
						<span class="font-medium text-gray-900">
							<Icon name={expanded === workout.id ? 'chevron-down' : 'chevron-right'} />
							{workout.title}
						</span>
						<span class="block text-xs text-gray-500">
							{workout.categoryName ?? 'No category'}{#if workout.minutes}, ~{workout.minutes} min{/if}{#if workout.lastDoneAt}
								&nbsp;· last done {workout.lastDoneAt.slice(0, 10)}{/if}
						</span>
					</button>

					<div class="list-row-actions">
						<form method="post" action="?/done" use:enhance>
							<input type="hidden" name="id" value={workout.id} />
							<button
								class="icon-btn"
								title={t('health.workouts.doneJustNow')}
								aria-label={t('health.workouts.markDone', { title: workout.title })}
							>
								<Icon name="check" />
							</button>
						</form>

						<!-- The tick says it happened; this says how much of what. -->
						<button
							class="icon-btn"
							title={t('health.workouts.writeDownWhatYouDid')}
							aria-label={t('health.workouts.writeDownWhatYouDid2', { title: workout.title })}
							onclick={() => startLog(workout)}
						>
							<Icon name="note" />
						</button>

						<button
							class="icon-btn"
							title={t('health.workouts.putItOnADay')}
							aria-label={t('health.workouts.planOntoADay', { title: workout.title })}
							onclick={() => (scheduling = workout)}
						>
							<Icon name="calendar" />
						</button>

						<button
							class="icon-btn"
							aria-label={t('health.workouts.edit', { title: workout.title })}
							onclick={() => openEdit(workout)}
						>
							<Icon name="edit" />
						</button>

						<form
							method="post"
							action="?/archive"
							use:enhance
							title={t('health.workouts.putThisWorkoutAway')}
						>
							<input type="hidden" name="id" value={workout.id} />
							<input type="hidden" name="archived" value="true" />
							<button
								class="icon-btn"
								aria-label={t('health.workouts.archive', { title: workout.title })}
							>
								<Icon name="archive" />
							</button>
						</form>
					</div>

					{#if expanded === workout.id}
						{@const history = sessionsOf(workout.id)}
						<div class="w-full space-y-3 border-t border-gray-100 pt-3">
							<div class="text-sm whitespace-pre-wrap text-gray-700">
								{#if workout.plan}{workout.plan}{:else}<span class="text-gray-400"
										>{t('health.workouts.noPlanWrittenYet')}</span
									>{/if}
							</div>

							<!--
							What was actually done, under the plan for it.

							The plan is the intention and this is the record, and they belong
							on the same panel: somebody opening a workout to see what it asks
							of them is the same person wondering what they managed last time.
						-->
							<div class="border-t border-gray-100 pt-3">
								<div class="mb-2 flex items-center justify-between">
									<h3 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
										{t('health.workouts.whatYouDid')}
									</h3>
									<button class="btn btn-sm" onclick={() => startLog(workout)}>
										<Icon name="plus" />
										{t('health.workouts.writeOneDown')}
									</button>
								</div>

								{#if history.length === 0}
									<p class="text-sm text-gray-500">
										{t('health.workouts.nothingWrittenDownYetRecord')}
									</p>
								{:else}
									<ul class="divide-y divide-gray-100 border-t border-gray-100">
										{#each history as session (session.id)}
											<li class="flex items-start gap-3 py-2 text-sm">
												<span class="tabular w-20 shrink-0 text-gray-500"
													>{dayOf(session.doneOn)}</span
												>
												<div class="min-w-0 flex-1">
													{#if session.measures.length === 0}
														<span class="text-gray-400">{t('ui.done')}</span>
													{:else}
														<!--
															Each measure as three parts rather than one sentence.

															"benched 80 kg · for 10 reps · overhead pressed 44 kg" is a
															line you read; what somebody scanning a column of these
															wants is the figures, and they carried the same weight as
															the words around them. The number takes the emphasis and
															the tabular digits, so a month of sessions reads down the
															column as well as across.
														-->
														<span class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
															{#each session.measures as measure (measure.id)}
																<span class="inline-flex items-baseline gap-1">
																	<span class="text-gray-500">{measure.activity}</span>
																	{#if measure.amount !== null}
																		<span class="tabular font-medium text-gray-900"
																			>{measure.amount}</span
																		>
																		{#if measure.unit}
																			<span class="text-xs text-gray-500">{measure.unit}</span>
																		{/if}
																	{/if}
																</span>
															{/each}
														</span>
													{/if}
													{#if session.notes}
														<p class="text-xs text-gray-500">{session.notes}</p>
													{/if}
												</div>
												<div class="flex shrink-0 items-center gap-1">
													<button
														class="icon-btn"
														title={t('health.workouts.correctThis')}
														aria-label={t('health.workouts.correctTheSessionOn', {
															doneOn: session.doneOn
														})}
														onclick={() => startEditSession(workout, session)}
													>
														<Icon name="edit" />
													</button>
													<button
														class="icon-btn icon-btn-danger"
														title={t('health.workouts.removeThis')}
														aria-label={t('health.workouts.removeTheSessionOn', {
															doneOn: session.doneOn
														})}
														onclick={() => (confirmDeleteSession = session)}
													>
														<Icon name="trash" />
													</button>
												</div>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if archived.length > 0}
		<div>
			<button
				class="text-sm text-gray-500 hover:text-gray-700"
				onclick={() => (showArchived = !showArchived)}
			>
				<Icon name={showArchived ? 'chevron-down' : 'chevron-right'} />{t(
					'health.workouts.archived',
					{ length: archived.length }
				)}</button
			>
			{#if showArchived}
				<ul class="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
					{#each archived as workout (workout.id)}
						<li class="flex items-center gap-3 px-4 py-2 text-sm">
							<span class="min-w-0 flex-1 text-gray-600">{workout.title}</span>
							<span class="text-xs text-gray-400">{workout.categoryName ?? 'No category'}</span>
							<form method="post" action="?/archive" use:enhance>
								<input type="hidden" name="id" value={workout.id} />
								<input type="hidden" name="archived" value="false" />
								<button class="btn btn-sm" type="submit">{t('health.workouts.restore')}</button>
							</form>
							<button
								class="icon-btn"
								aria-label={t('health.workouts.delete', { title: workout.title })}
								onclick={() => (confirmingDelete = workout)}
							>
								<Icon name="trash" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<!-- New / edit, one form. -->
<Modal
	bind:open={showForm}
	error={form?.message}
	title={editing ? 'Edit workout' : 'New workout'}
	onclose={() => (editing = null)}
	size="md"
>
	<form
		id="workout-form"
		method="post"
		action={editing ? '?/update' : '?/create'}
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') showForm = false;
				return update({ reset: result.type === 'success' });
			}}
	>
		{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
		<div class="space-y-3">
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block text-sm">
					<span class="text-gray-600">{t('ui.name')}</span>
					<OneLine
						name="heading"
						placeholder={t('health.workouts.pushDay')}
						value={editing?.title ?? ''}
						class="input mt-1 w-full"
						required
						autofocus
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('ui.category')}</span>
					<select name="categoryId" class="select mt-1 w-full" value={editing?.categoryId ?? ''}>
						<option value="">{t('health.workouts.noCategory')}</option>
						{#each data.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
					</select>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('health.workouts.aboutHowLongMin')}</span>
					<NumberBox
						name="minutes"
						min="1"
						value={editing?.minutes ?? ''}
						class="mt-1 w-full"
						placeholder="45"
					/>
				</label>
			</div>
			<label class="block text-sm">
				<span class="text-gray-600">{t('health.workouts.plan')}</span>
				<textarea
					name="plan"
					rows="4"
					class="input mt-1 w-full"
					placeholder={t('health.workouts.benchRowsDips48')}>{editing?.plan ?? ''}</textarea
				>
			</label>

			<!--
				What this workout measures — names, not numbers.

				Nothing is recorded here. It decides what the form for a session
				opens on, so writing one down is filling in figures beside words
				somebody already chose rather than typing "deadlifted" again every
				week. A session may still measure anything; this is what is already
				on screen.
			-->
			<div>
				<span class="text-sm text-gray-600">{t('health.workouts.whatItMeasures')}</span>
				<p class="mb-2 text-xs text-gray-500">
					{t('health.workouts.suggestedWhenYouWriteA')}
				</p>
				<div class="mb-1 grid grid-cols-[1fr_6rem_auto] gap-2 text-xs text-gray-500">
					<span>{t('health.workouts.what')}</span>
					<span>{t('ui.unit')}</span>
					<span></span>
				</div>
				{#each declared as measure, index (index)}
					<div class="mb-2 grid grid-cols-[1fr_6rem_auto] items-center gap-2">
						<!-- A plain input, not a `OneLine`: it completes from the datalist
						     the session form declares, and a textarea cannot carry one.
						     See `tests/autofill-field-names.test.ts`. -->
						<input
							type="text"
							name="planActivity"
							list="workout-activities"
							placeholder={t('health.workouts.ran')}
							autocomplete="off"
							bind:value={measure.activity}
							oninput={() => declaredTyped(index)}
							class="input"
						/>
						<OneLine
							name="planUnit"
							placeholder={t('health.workouts.km')}
							bind:value={measure.unit}
							class="input"
						/>
						<div class="flex items-center">
							<button
								type="button"
								class="icon-btn"
								disabled={index === 0}
								title={t('health.workouts.askForThisOneEarlier')}
								aria-label={t('health.workouts.moveUp', { activity: measure.activity || 'this' })}
								onclick={() => moveDeclared(index, -1)}
							>
								<Icon name="chevron-up" />
							</button>
							<button
								type="button"
								class="icon-btn"
								disabled={index === declared.length - 1}
								title={t('health.workouts.askForThisOneLater')}
								aria-label={t('health.workouts.moveDown', { activity: measure.activity || 'this' })}
								onclick={() => moveDeclared(index, 1)}
							>
								<Icon name="chevron-down" />
							</button>
							<button
								type="button"
								class="icon-btn icon-btn-danger"
								title={t('health.workouts.takeThisOneOut')}
								aria-label={t('health.workouts.stopMeasuring', {
									activity: measure.activity || 'this'
								})}
								onclick={() => removeDeclared(index)}
							>
								<Icon name="minus" />
							</button>
						</div>
					</div>
				{/each}
				<button type="button" class="btn btn-sm" onclick={() => declared.push(blankDeclared())}>
					<Icon name="plus" />
					{t('health.workouts.measureSomethingElse')}
				</button>
			</div>
		</div>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="workout-form">
			{editing ? 'Save' : 'Add'}
		</button>
	{/snippet}
</Modal>

<!-- Put it on a day: the same gesture a to-do has, and the same result — a
     block on the grid that IS this workout, so finishing either finishes both. -->
<Modal
	open={scheduling !== null}
	error={form?.message}
	title={t('health.workouts.putItOnADay')}
	description="It gains a time on the plan. Finishing it there finishes the workout."
	onclose={() => (scheduling = null)}
	size="sm"
>
	{#if scheduling}
		<form
			id="schedule-form"
			method="post"
			action="?/schedule"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') scheduling = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={scheduling.id} />
			<p class="mb-3 text-sm font-medium text-gray-900">{scheduling.title}</p>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block text-sm">
					<span class="text-gray-600">{t('ui.date')}</span>
					<input
						name="date"
						type="date"
						required
						value={todayStr()}
						class="input mt-1 w-full"
						autocomplete="off"
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('health.workouts.time')}</span>
					<input
						name="startTime"
						type="time"
						required
						value="09:00"
						class="input tabular mt-1 w-full"
						autocomplete="off"
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('health.workouts.minutes')}</span>
					<NumberBox
						name="durationMinutes"
						min="5"
						value={scheduling.minutes ?? 60}
						class="mt-1 w-full"
					/>
				</label>
			</div>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (scheduling = null)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="schedule-form"
			>{t('health.workouts.putOnTheDay')}</button
		>
	{/snippet}
</Modal>

<!--
	What you did, and how much of it.

	One dialog for writing a session down and for correcting one, because they
	are the same three questions — when, what, and anything worth saying — and
	two forms would have drifted. The lines post as three parallel lists rather
	than indexed names: rows are added and removed here, and a gap left by a
	removed `measure[3]` is a hole the server would have to code around.
-->
<Modal
	open={logging !== null}
	error={form?.message}
	title={editingSession ? 'Correct what you did' : 'What did you do?'}
	description="Everything here is optional. A session with nothing measured is still a session."
	onclose={closeLog}
	size="md"
>
	{#if logging}
		<form
			id="log-form"
			method="post"
			action={editingSession ? '?/updateSession' : '?/log'}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') closeLog();
					return update({ reset: false });
				}}
		>
			<input type="hidden" name="id" value={logging.id} />
			{#if editingSession}<input type="hidden" name="sessionId" value={editingSession.id} />{/if}

			<p class="mb-3 text-sm font-medium text-gray-900">{logging.title}</p>

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block text-sm">
					<span class="text-gray-600">{t('health.workouts.day')}</span>
					<input
						name="doneOn"
						type="date"
						required
						bind:value={logDate}
						class="input mt-1 w-full"
						autocomplete="off"
					/>
				</label>
			</div>

			<!--
				Activity, amount, unit — the person's own words in all three. Nothing
				here knows what a kilometre is, which is what lets somebody log pages
				read or minutes held in the same table as a deadlift.
			-->
			<div class="mt-4">
				<div class="mb-1 grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 text-xs text-gray-500">
					<span>{t('health.workouts.whatYouDid')}</span>
					<span>{t('health.workouts.howMuch')}</span>
					<span>{t('ui.unit')}</span>
					<span></span>
				</div>
				{#each lines as line, index (index)}
					<div class="mb-2 grid grid-cols-[1fr_5rem_5rem_2rem] items-center gap-2">
						<!-- A plain input, not a `OneLine`: it completes from the datalist
						     below, and a textarea cannot carry one. See
						     `tests/autofill-field-names.test.ts`, which exempts exactly
						     this case. -->
						<input
							type="text"
							name="measureActivity"
							list="workout-activities"
							placeholder={t('health.workouts.ran')}
							autocomplete="off"
							bind:value={line.activity}
							oninput={() => lineTyped(index)}
							class="input"
						/>
						<NumberBox
							name="measureAmount"
							min="0"
							step="any"
							placeholder="5"
							bind:value={line.amount}
							class="tabular"
						/>
						<OneLine
							name="measureUnit"
							placeholder={t('health.workouts.km')}
							bind:value={line.unit}
							class="input"
						/>
						<button
							type="button"
							class="icon-btn icon-btn-danger"
							title={t('health.workouts.takeThisLineOut')}
							aria-label={t('health.workouts.takeOutTheLineFor', {
								row: line.activity || 'this row'
							})}
							onclick={() => removeLine(index)}
						>
							<Icon name="minus" />
						</button>
					</div>
				{/each}

				<button type="button" class="btn btn-sm" onclick={() => lines.push(blankLine())}>
					<Icon name="plus" />
					{t('health.workouts.addALine')}
				</button>
			</div>

			<label class="mt-4 block text-sm">
				<span class="text-gray-600">{t('health.workouts.anythingWorthSaying')}</span>
				<textarea
					name="notes"
					rows="2"
					bind:value={logNotes}
					class="input mt-1 w-full"
					placeholder={t('health.workouts.feltHeavyRightKneeComplained')}
				></textarea>
			</label>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={closeLog}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="log-form">
			{editingSession ? 'Save' : 'Write it down'}
		</button>
	{/snippet}
</Modal>

<!-- A session logged by accident. Its lines go with it, and nothing else does. -->
<Modal
	open={confirmDeleteSession !== null}
	title={t('health.workouts.removeThisSession')}
	onclose={() => (confirmDeleteSession = null)}
	size="sm"
>
	{#if confirmDeleteSession}
		<p class="text-sm text-gray-600">
			{t('health.workouts.whatYouRecordedOn')} <strong>{confirmDeleteSession.doneOn}</strong>
			{t('health.workouts.isRemovedForGoodThe')}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmDeleteSession = null)}
			>{t('health.workouts.keepIt')}</button
		>
		<form
			method="post"
			action="?/deleteSession"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmDeleteSession = null;
					return update();
				}}
		>
			<input type="hidden" name="sessionId" value={confirmDeleteSession?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.remove')}</button>
		</form>
	{/snippet}
</Modal>

<!-- Hard delete, only from the archived list, confirmed in its own dialog. -->
<Modal
	open={confirmingDelete !== null}
	error={form?.message}
	title={t('health.workouts.deleteThisWorkout')}
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.title}</strong>
			{t('health.workouts.isDeletedForGoodAnd')}
		</p>
		<!-- One that has been done is refused, and the dialog stays open to say
		     so: the sessions behind it are the record of what somebody actually
		     did, and deleting the plan would take them with it. -->
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}
			>{t('health.workouts.keepIt')}</button
		>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingDelete = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>

<!--
	The categories this account keeps.

	They were five words in the schema — strength, cardio, mobility, sport,
	other — which is somebody else deciding what your training is made of, and
	the fifth being called "other" is the proof it did not fit. The same shape
	and the same word as the shopping list's categories, because it is the same
	idea and calling it something else would be two names for one thing.
-->
<Modal
	bind:open={showCategories}
	error={form?.message}
	title={t('health.workouts.categoriesOfWorkout')}
	description="Yours to name. A workout keeps existing if you remove the category it was filed under."
	size="sm"
>
	<ul class="divide-y divide-gray-200 border border-gray-200">
		{#each data.categories as category (category.id)}
			<li class="flex items-center gap-2 px-3 py-2">
				{#if editingCategory === category.id}
					<form
						method="post"
						action="?/renameCategory"
						use:enhance={() =>
							async ({ update, result }) => {
								await update({ reset: false });
								if (result.type === 'success') editingCategory = null;
							}}
						class="flex flex-1 items-center gap-2"
					>
						<input type="hidden" name="id" value={category.id} />
						<OneLine name="name" value={category.name} required autofocus class="input flex-1" />
						<button
							class="btn btn-sm btn-primary"
							title={t('ui.save')}
							aria-label={t('health.workouts.saveTheName')}
						>
							<Icon name="check" />
						</button>
						<button type="button" class="btn btn-sm" onclick={() => (editingCategory = null)}>
							{t('ui.cancel')}
						</button>
					</form>
				{:else}
					<span class="flex-1 text-sm text-gray-900">{category.name}</span>
					<button
						onclick={() => (editingCategory = category.id)}
						class="icon-btn"
						title={t('ui.rename')}
						aria-label={t('health.workouts.rename', { name: category.name })}
						><Icon name="edit" /></button
					>
					{#if confirmDeleteCategory === category.id}
						<form
							method="post"
							action="?/deleteCategory"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
									confirmDeleteCategory = null;
								}}
							class="flex items-center gap-1"
						>
							<input type="hidden" name="id" value={category.id} />
							<button
								type="button"
								class="btn btn-sm"
								onclick={() => (confirmDeleteCategory = null)}
							>
								{t('ui.cancel')}
							</button>
							<button class="btn btn-danger btn-sm" use:armed>{t('ui.remove')}</button>
						</form>
					{:else}
						<button
							onclick={() => (confirmDeleteCategory = category.id)}
							class="icon-btn icon-btn-danger"
							title={t('ui.remove')}
							aria-label={t('health.workouts.remove', { name: category.name })}
							><Icon name="trash" /></button
						>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

	{#if addingCategory}
		<form
			method="post"
			action="?/createCategory"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: result.type === 'success' });
					if (result.type === 'success') addingCategory = false;
				}}
			class="mt-3 flex items-center gap-2"
		>
			<OneLine
				name="label"
				placeholder={t('health.workouts.swimming')}
				required
				autofocus
				class="input flex-1"
			/>
			<button
				class="btn btn-sm btn-primary"
				title={t('ui.add')}
				aria-label={t('health.workouts.addTheCategory')}
			>
				<Icon name="plus" />
			</button>
			<button type="button" class="btn btn-sm" onclick={() => (addingCategory = false)}
				>{t('ui.cancel')}</button
			>
		</form>
	{:else}
		<button onclick={() => (addingCategory = true)} class="btn btn-sm mt-3">
			<Icon name="plus" />
			{t('health.workouts.newCategory')}
		</button>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn btn-primary" onclick={() => (showCategories = false)}
			>{t('ui.done')}</button
		>
	{/snippet}
</Modal>

<!--
	The names this account has used before, so "deadlifted" is spelled the same
	way every time and a chart can group by it.

	At the page level rather than inside a dialog: both the workout form and the
	session form complete from it, and a `list=` pointing at a datalist that is
	not currently rendered completes from nothing.
-->
<datalist id="workout-activities">
	{#each data.activityNames as known (`${known.activity} ${known.unit}`)}
		<option value={known.activity}></option>
	{/each}
</datalist>
