<script lang="ts">
	/**
	 * The fields a goal is written with, wherever it is written.
	 *
	 * This lived inside the goals page, which meant a goal could only be made
	 * there: the notebook's own "New goal" was a link that threw you out of the
	 * notebook you were looking at, while a task made from the same header
	 * stayed put. That was a shape the code had, not one anybody chose — the
	 * comment defending it said as much.
	 *
	 * So it is a component like `TodoFields` and `NoteFields` beside it. The
	 * page keeps the state, the actions and the modal; this is the form's
	 * inside, and it is the same inside in both places.
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { COUNT_STEP, NUMBER_KINDS, exampleNumber } from '$lib/number-kinds';
	import { HORIZONS, HORIZON_LABELS, type Horizon } from '$lib/goals';
	import { useT } from '$lib/i18n';

	/**
	 * What this form reads off a goal, rather than the page's whole row.
	 *
	 * Named here so the component does not depend on a type derived from one
	 * page's loader — it needs four fields and says so.
	 */
	export type EditingGoal = {
		title: string;
		notes: string | null;
		areaId: number | null;
		notebookId: number | null;
	};

	/** An open goal this one could be nested under. */
	export type ParentOption = { id: number; title: string; horizon: Horizon };

	/** One row of "what this goal is measured by". */
	export type FormTarget = {
		id: number | null;
		value: string;
		unit: string;
		whole: boolean;
		/** A workout measure this one counts, or '' for a number kept by hand. */
		measureActivity: string;
	};

	let {
		/** The goal being edited, or null when one is being made. */
		editing = null,
		editingId = null,
		horizon = $bindable('week' as Horizon),
		start = $bindable(''),
		targets = $bindable([] as FormTarget[]),
		/** Which period the chosen start lands in, shown beside the field. */
		period = '',
		areas,
		notebooks,
		workoutMeasures,
		/** Open goals this one could be nested under. */
		parentOptions = [] as ParentOption[],
		/** Units already used elsewhere, offered as a datalist. */
		knownUnits = [],
		/** The notebook a goal made from inside one belongs to. */
		startingNotebook = null
	}: {
		editing?: EditingGoal | null;
		editingId?: number | null;
		horizon?: Horizon;
		start?: string;
		targets?: FormTarget[];
		period?: string;
		areas: { id: number; name: string }[];
		notebooks: { id: number; title: string }[];
		workoutMeasures: { activity: string; unit: string }[];
		parentOptions?: ParentOption[];
		knownUnits?: string[];
		startingNotebook?: number | null;
	} = $props();

	const t = useT();

	/**
	 * A fresh measure row. Counted by default: most goals are a number of
	 * things done, kept by hand, which is what an empty measure means.
	 */
	function blankTarget(): FormTarget {
		return { id: null, value: '', unit: '', whole: true, measureActivity: '' };
	}
</script>

<FormGrid>
	<Field label={t('goals.goal')} span={12} required>
		<OneLine
			name="heading"
			placeholder={t('goals.eGTrainThreeTimesA')}
			value={editing?.title ?? ''}
			class="input"
			required
			autofocus
		/>
	</Field>

	<Field label={t('goals.horizon')} span={4}>
		<select name="horizon" bind:value={horizon} class="select">
			{#each HORIZONS as h (h)}
				<option value={h}>{t(HORIZON_LABELS[h])}</option>
			{/each}
		</select>
	</Field>

	<Field
		label={t('goals.starts')}
		span={4}
		hint={period ? t('goals.countsFor', { period: period }) : ''}
	>
		<input autocomplete="off" name="startDate" type="date" bind:value={start} class="input" />
	</Field>

	<Field label={t('goals.area')} span={4}>
		<select name="areaId" class="select">
			<option value="">{t('goals.none')}</option>
			{#each areas as area (area.id)}
				<option value={area.id} selected={editing?.areaId === area.id}>{area.name}</option>
			{/each}
		</select>
	</Field>

	<NotebookField {notebooks} value={editing?.notebookId ?? startingNotebook} span={4} />

	<!--
		What the goal is measured by, one row per thing. Several of them is
		the ordinary case for a big goal — three gigs played and five songs
		recorded — and each keeps its own number.
	-->
	<div class="col-span-12">
		<span class="eyebrow text-gray-600">{t('goals.measuredBy')}</span>
		<div class="mt-1 space-y-2">
			{#each targets as target, i (i)}
				<div class="flex items-center gap-2">
					<input type="hidden" name="targetId" value={target.id ?? ''} />
					<!--
						Counted or measured, before the number itself.

						It decides what the goal's own card offers later — a plus
						and a minus, or a field — so it sits where the number is
						being decided rather than somewhere in a settings screen.
					-->
					<label class="shrink-0">
						<span class="sr-only">{t('goals.whatKindOfNumber')}</span>
						<select
							name="targetWhole"
							bind:value={target.whole}
							class="select w-16 text-center text-base"
							title={NUMBER_KINDS.find((k) => k.whole === target.whole)?.label}
						>
							{#each NUMBER_KINDS as kind (kind.symbol)}
								<option value={kind.whole} title={kind.label}>{kind.symbol}</option>
							{/each}
						</select>
					</label>
					<NumberBox
						autocomplete="off"
						name="targetValue"
						min="0"
						step={target.whole ? COUNT_STEP : 'any'}
						inputmode={target.whole ? 'numeric' : 'decimal'}
						placeholder={exampleNumber(target.whole, t.locale)}
						bind:value={target.value}
						class="w-24 shrink-0"
					/>
					<input
						autocomplete="off"
						name="targetUnit"
						list="goal-units"
						placeholder={t('goals.booksKmGigs')}
						bind:value={target.unit}
						class="input min-w-0 flex-1"
					/>
					<button
						type="button"
						class="icon-btn icon-btn-danger"
						title={t('goals.removeMeasure')}
						aria-label={t('goals.removeMeasure')}
						onclick={() => (targets = targets.filter((_, at) => at !== i))}
					>
						<Icon name="trash" />
					</button>
				</div>
				<!--
					Counted from the workouts, or kept by hand.

					Only where there is something to count: an account that has
					never logged a measure gets no picker for one, rather than an
					empty dropdown saying nothing. Choosing one takes the unit
					from the register too, because "km" was already typed there
					and two spellings of one unit are two units.
				-->
				{#if workoutMeasures.length > 0}
					<label class="mt-1 flex items-center gap-2 pl-1">
						<span class="eyebrow shrink-0 text-gray-500">{t('goals.countedFrom')}</span>
						<select
							name="targetMeasure"
							class="select min-w-0 flex-1 py-1 text-xs"
							bind:value={target.measureActivity}
							onchange={() => {
								const found = workoutMeasures.find(
									(m: { activity: string; unit: string }) => m.activity === target.measureActivity
								);
								if (found?.unit) target.unit = found.unit;
							}}
						>
							<option value="">{t('goals.iKeepThisOneMyself')}</option>
							{#each workoutMeasures as measure (measure.activity + measure.unit)}
								<option value={measure.activity}>
									{measure.activity}{measure.unit ? ` (${measure.unit})` : ''}
								</option>
							{/each}
						</select>
					</label>
				{/if}
			{/each}
		</div>
		<datalist id="goal-units">
			{#each knownUnits as unit (unit)}
				<option value={unit}></option>
			{/each}
		</datalist>
		<button
			type="button"
			class="btn btn-sm mt-2"
			onclick={() => (targets = [...targets, blankTarget()])}
		>
			<Icon name="plus" />
			{t('goals.addMeasure')}
		</button>
		<span class="mt-1 block text-xs text-gray-500">
			{t('goals.optionalLeaveItEmptyFor')}
		</span>
	</div>

	{#if !editingId}
		<Field label={t('goals.partOf')} span={4}>
			<select name="parentId" class="select">
				<option value="">{t('goals.standalone')}</option>
				{#each parentOptions as g (g.id)}
					<option value={g.id}>{t(HORIZON_LABELS[g.horizon])}: {g.title}</option>
				{/each}
			</select>
		</Field>
	{/if}

	<Field label={t('ui.notes')} span={12}>
		<textarea name="notes" rows="3" class="textarea" value={editing?.notes ?? ''}></textarea>
	</Field>
</FormGrid>
