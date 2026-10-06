<script lang="ts">
	/**
	 * What a workout card's buttons open, wherever the card is.
	 *
	 * The Health room had these as its own dialogs, so a notebook's Workouts tab
	 * could only send somebody there to edit a workout or write a session down
	 * — and leaving the notebook is not what a button on it should do; a task's
	 * or a note's opens where it is. One copy, mounted by both screens: the
	 * workout itself, putting it on a day, what was done (new or corrected),
	 * and taking a session back out. Where they post is `actions`, as for the
	 * card — see `$lib/workout-action-names`.
	 *
	 * Opened by its exported functions, which the caller wires to the card's
	 * callbacks.
	 */
	import { civilOf, today } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import WorkoutFields from '$lib/components/fields/WorkoutFields.svelte';
	import { armed } from '$lib/actions/armed';
	import type { Workout } from '$lib/services/workouts';
	import type { WorkoutActionNames } from '$lib/workout-action-names';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** Where "put it on a day" starts, before anybody changes it. */
	const DEFAULT_START = '09:00';
	const DEFAULT_MINUTES = 60;

	type Session = {
		id: number;
		workoutId: number;
		doneOn: string;
		notes: string;
		measures: { activity: string; amount: number | null; unit: string }[];
	};

	let {
		/** The register: every session the screen has, of every workout. */
		sessions,
		categories,
		notebooks,
		/** The names this account has measured before, for the datalist. */
		activityNames,
		actions,
		/** What the server last refused with, where the screen has it. */
		error = undefined,
		/** The notebook a new workout written here belongs to. */
		startingNotebook = null
	}: {
		sessions: Session[];
		categories: { id: number; name: string }[];
		notebooks: { id: number; title: string; modules: readonly string[] }[];
		activityNames: { activity: string; unit: string }[];
		actions: WorkoutActionNames;
		error?: string;
		startingNotebook?: number | null;
	} = $props();

	/** Today where the account lives, for the date fields' starting value. */
	function todayStr(): string {
		return today(now());
	}

	// One form for new and edit, so the two cannot drift.
	let showForm = $state(false);
	let editing: Workout | null = $state(null);
	/** The workout being put on a day. */
	let scheduling: Workout | null = $state(null);

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

	export function openNew() {
		editing = null;
		declared = [blankDeclared()];
		showForm = true;
	}

	export function edit(chosen: Workout) {
		editing = chosen;
		declared = [...chosen.measures.map((m) => ({ ...m })), blankDeclared()];
		showForm = true;
	}

	export function schedule(chosen: Workout) {
		scheduling = chosen;
	}

	/*
	 * The register: what was actually done, and how much of it.
	 *
	 * "Last done" says whether somebody is keeping a workout up and cannot say
	 * whether they are getting anywhere with it. A session is a day plus lines
	 * of activity, amount and unit in their own words — ran 5 km, deadlifted
	 * 120 kg — so the answer to "am I lifting more than in March" is in the app
	 * rather than in a notebook, and a chart can be drawn over it.
	 */

	/**
	 * One line of a session, and whether the workout asked for it.
	 *
	 * `declared` means the workout names this measure — so the name and the
	 * unit are its answer to "what is this for", not something to retype every
	 * session. Those rows read as a label with one box to fill in; a row
	 * somebody adds themselves is three free fields, because it is theirs.
	 */
	type Line = { activity: string; amount: string; unit: string; declared: boolean };

	/** A row nobody has typed in yet. The form always ends with one. */
	const blankLine = (): Line => ({ activity: '', amount: '', unit: '', declared: false });

	/** The sessions of one workout, newest first, as the loader ordered them. */
	function sessionsOf(workoutId: number): Session[] {
		return sessions.filter((session) => session.workoutId === workoutId);
	}

	/**
	 * Which workout's register is being written, and what is in the form.
	 *
	 * `logging` is the workout; `editingSession` is set as well when an
	 * existing session is being corrected, so the two share one dialog and one
	 * set of rows rather than drifting apart as a "new" and an "edit" form.
	 */
	let logging: Workout | null = $state(null);
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
	function openingLines(workout: Workout): Line[] {
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
			out.push({ activity: measure.activity, amount: '', unit: measure.unit, declared: true });
		}

		// Then anything past sessions measured that the workout never named —
		// somebody who logged a thing twice is likely to log it again.
		for (const session of sessionsOf(workout.id)) {
			for (const measure of session.measures) {
				const key = `${measure.activity} ${measure.unit}`;
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({ activity: measure.activity, amount: '', unit: measure.unit, declared: false });
			}
		}
		return out.length > 0 ? [...out, blankLine()] : [blankLine()];
	}

	export function log(workout: Workout) {
		logging = workout;
		editingSession = null;
		logDate = todayStr();
		logNotes = '';
		lines = openingLines(workout);
	}

	/**
	 * Correcting a session asks the same questions writing one did.
	 *
	 * It used to open on the session's own lines alone, which for a session
	 * that measured nothing is one empty row — so a workout that declares pull
	 * ups and rows offered neither of them, and the way to record what you
	 * actually did was to type both names again from memory. The workout's
	 * measures are the questions; the session is the answers so far.
	 */
	export function editSession(workout: Workout, sessionId: number) {
		const session = sessions.find((one) => one.id === sessionId);
		if (!session) return;
		logging = workout;
		editingSession = session;
		logDate = session.doneOn;
		logNotes = session.notes;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read and emptied inside this call; nothing renders from it.
		const answered = new Map(
			session.measures.map((measure) => [`${measure.activity}\u0000${measure.unit}`, measure])
		);
		const out: Line[] = [];

		for (const measure of workout.measures) {
			const key = `${measure.activity}\u0000${measure.unit}`;
			const said = answered.get(key);
			answered.delete(key);
			out.push({
				activity: measure.activity,
				unit: measure.unit,
				amount: said?.amount === null || said?.amount === undefined ? '' : String(said.amount),
				declared: true
			});
		}

		// And whatever the session measured that the workout never named, which
		// is somebody's own addition and stays editable.
		for (const measure of answered.values()) {
			out.push({
				activity: measure.activity,
				unit: measure.unit,
				amount: measure.amount === null ? '' : String(measure.amount),
				declared: false
			});
		}

		lines = [...out, blankLine()];
	}

	export function removeSession(sessionId: number) {
		confirmDeleteSession = sessions.find((one) => one.id === sessionId) ?? null;
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
</script>

<!-- New / edit, one form. -->
<Modal
	bind:open={showForm}
	{error}
	title={editing ? t('health.workouts.editWorkout') : t('health.workouts.newWorkout')}
	onclose={() => (editing = null)}
	size="md"
>
	<form
		id="workout-form"
		method="post"
		action={editing ? actions.update : actions.create}
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') showForm = false;
				return update({ reset: result.type === 'success' });
			}}
	>
		{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
		<WorkoutFields {editing} {categories} bind:measures={declared} {notebooks} {startingNotebook} />
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="workout-form">
			{editing ? t('ui.save') : t('ui.add')}
		</button>
	{/snippet}
</Modal>

<!-- Put it on a day: the same gesture a to-do has, and the same result — a
     block on the grid that IS this workout, so finishing either finishes both. -->
<Modal
	open={scheduling !== null}
	{error}
	title={t('health.workouts.putItOnADay')}
	description={t('health.workouts.itGainsATimeOn')}
	onclose={() => (scheduling = null)}
	size="sm"
>
	{#if scheduling}
		<form
			id="schedule-form"
			method="post"
			action={actions.schedule}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') scheduling = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={scheduling.id} />
			<p class="mb-3 text-sm font-medium text-gray-900">{scheduling.title}</p>
			<FormGrid>
				<Field label={t('ui.date')} span={6} required>
					<input
						name="date"
						type="date"
						required
						value={todayStr()}
						class="input"
						autocomplete="off"
					/>
				</Field>
				<Field label={t('health.workouts.time')} span={6} required>
					<input
						name="startTime"
						type="time"
						required
						value={DEFAULT_START}
						class="input tabular"
						autocomplete="off"
					/>
				</Field>
				<Field label={t('health.workouts.minutes')} span={6}>
					<NumberBox name="durationMinutes" min="5" value={scheduling.minutes ?? DEFAULT_MINUTES} />
				</Field>
			</FormGrid>
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
	{error}
	title={editingSession
		? t('health.workouts.correctWhatYouDid')
		: t('health.workouts.whatDidYouDo')}
	description={t('health.workouts.everythingHereIsOptionalA')}
	onclose={closeLog}
	size="md"
>
	{#if logging}
		<form
			id="log-form"
			method="post"
			action={editingSession ? actions.updateSession : actions.log}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') closeLog();
					return update({ reset: false });
				}}
		>
			<input type="hidden" name="id" value={logging.id} />
			{#if editingSession}<input type="hidden" name="sessionId" value={editingSession.id} />{/if}

			<p class="mb-3 text-sm font-medium text-gray-900">{logging.title}</p>

			<FormGrid>
				<Field label={t('health.workouts.day')} span={6} required>
					<input
						name="doneOn"
						type="date"
						required
						bind:value={logDate}
						class="input"
						autocomplete="off"
					/>
				</Field>
			</FormGrid>

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
						{#if line.declared}
							<!--
								The workout already said what this is. Its name and its unit
								are the question, so they are written rather than offered as
								two boxes to retype from memory every session — all that is
								left to say is how much.
							-->
							<span class="truncate text-sm text-gray-900" title={line.activity}
								>{line.activity}</span
							>
							<input type="hidden" name="measureActivity" value={line.activity} />
							<NumberBox
								name="measureAmount"
								min="0"
								step="any"
								placeholder="5"
								bind:value={line.amount}
								class="tabular"
							/>
							<span class="truncate text-sm text-gray-500" title={line.unit}>{line.unit}</span>
							<input type="hidden" name="measureUnit" value={line.unit} />
						{:else}
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
						{/if}
						<button
							type="button"
							class="icon-btn icon-btn-danger"
							title={t('health.workouts.takeThisLineOut')}
							aria-label={t('health.workouts.takeOutTheLineFor', {
								row: line.activity || t('health.workouts.thisRow')
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

			<div class="mt-4">
				<FormGrid>
					<Field label={t('health.workouts.anythingWorthSaying')} span={12}>
						<textarea
							name="notes"
							rows="2"
							bind:value={logNotes}
							class="textarea"
							placeholder={t('health.workouts.feltHeavyRightKneeComplained')}
						></textarea>
					</Field>
				</FormGrid>
			</div>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={closeLog}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="log-form">
			{editingSession ? t('ui.save') : t('health.workouts.writeItDown')}
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
			{t('health.workouts.whatYouRecordedOn')}
			<strong>{civilOf(confirmDeleteSession.doneOn, now())}</strong>
			{t('health.workouts.isRemovedForGoodThe')}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmDeleteSession = null)}
			>{t('health.workouts.keepIt')}</button
		>
		<form
			method="post"
			action={actions.deleteSession}
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

<!--
	The names this account has used before, so "deadlifted" is spelled the same
	way every time and a chart can group by it.

	Beside the dialogs rather than inside one: both the workout form and the
	session form complete from it, and a `list=` pointing at a datalist that is
	not currently rendered completes from nothing.
-->
<datalist id="workout-activities">
	{#each activityNames as known (`${known.activity} ${known.unit}`)}
		<option value={known.activity}></option>
	{/each}
</datalist>
