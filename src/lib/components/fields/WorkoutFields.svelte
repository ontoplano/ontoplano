<script lang="ts">
	/**
	 * What a workout is made of, including what it says it measures.
	 *
	 * One definition, two places: the Health room's dialog and a notebook's
	 * Workouts tab — the same reason `BillFields` and `HabitFields` exist. The
	 * measures come with it: naming them is not recording anything, it is
	 * deciding what writing a session down will ask for, and a workout written
	 * against a subject that could not name them opened an empty session form
	 * every week.
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	export type Measure = { activity: string; unit: string };

	type Editing = {
		title: string;
		categoryId: number | null;
		minutes: number | null;
		plan: string | null;
		notebookId?: number | null;
	} | null;

	let {
		editing = null,
		categories = [],
		/**
		 * What this workout measures, bound: the caller opens the form with the
		 * workout's own rows and reads them back out on save.
		 */
		measures = $bindable<Measure[]>([]),
		notebooks = [],
		/** The notebook a workout written from inside one belongs to. */
		startingNotebook = null
	}: {
		editing?: Editing;
		categories?: { id: number; name: string }[];
		measures?: Measure[];
		notebooks?: { id: number; title: string }[];
		startingNotebook?: number | null;
	} = $props();

	function blank(): Measure {
		return { activity: '', unit: '' };
	}

	/** The last row is always empty, so typing into it grows the list. */
	function typed(index: number) {
		if (index === measures.length - 1 && measures[index].activity.trim() !== '')
			measures.push(blank());
	}

	function remove(index: number) {
		measures.splice(index, 1);
		if (measures.length === 0) measures.push(blank());
	}

	/*
	 * And both directions, because this order is the order the session form
	 * opens in — a run that measures distance before pace asks for them in that
	 * order every week. The lines of a session have no such buttons: their
	 * order is how they were typed on the day, and nothing later reads it.
	 */
	function move(index: number, by: number) {
		const to = index + by;
		if (to < 0 || to >= measures.length) return;
		const [row] = measures.splice(index, 1);
		measures.splice(to, 0, row);
	}
</script>

<FormGrid>
	<Field label={t('ui.name')} span={6} required>
		<OneLine
			name="heading"
			placeholder={t('health.workouts.pushDay')}
			value={editing?.title ?? ''}
			class="input"
			required
			autofocus
		/>
	</Field>

	<Field label={t('ui.category')} span={6}>
		<select name="categoryId" class="select" value={editing?.categoryId ?? ''}>
			<option value="">{t('health.workouts.noCategory')}</option>
			{#each categories as category (category.id)}
				<option value={category.id}>{category.name}</option>
			{/each}
		</select>
	</Field>

	<Field label={t('health.workouts.aboutHowLongMin')} span={6}>
		<NumberBox name="minutes" min="1" value={editing?.minutes ?? ''} placeholder="45" />
	</Field>

	<NotebookField {notebooks} value={editing?.notebookId ?? startingNotebook} span={6} />

	<Field label={t('health.workouts.plan')} span={12}>
		<textarea
			name="plan"
			rows="4"
			class="textarea"
			placeholder={t('health.workouts.benchRowsDips48')}>{editing?.plan ?? ''}</textarea
		>
	</Field>

	<!--
		What this workout measures — names, not numbers.

		Nothing is recorded here. It decides what the form for a session opens
		on, so writing one down is filling in figures beside words somebody
		already chose rather than typing "deadlifted" again every week. A
		session may still measure anything; this is what is already on screen.
	-->
	<Field
		label={t('health.workouts.whatItMeasures')}
		span={12}
		hint={t('health.workouts.suggestedWhenYouWriteA')}
		group
	>
		<div class="mb-1 grid grid-cols-[1fr_6rem_auto] gap-2 text-xs text-gray-500">
			<span>{t('health.workouts.what')}</span>
			<span>{t('ui.unit')}</span>
			<span></span>
		</div>
		{#each measures as measure, index (index)}
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
					oninput={() => typed(index)}
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
						onclick={() => move(index, -1)}
					>
						<Icon name="chevron-up" />
					</button>
					<button
						type="button"
						class="icon-btn"
						disabled={index === measures.length - 1}
						title={t('health.workouts.askForThisOneLater')}
						aria-label={t('health.workouts.moveDown', { activity: measure.activity || 'this' })}
						onclick={() => move(index, 1)}
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
						onclick={() => remove(index)}
					>
						<Icon name="minus" />
					</button>
				</div>
			</div>
		{/each}
		<button type="button" class="btn btn-sm" onclick={() => measures.push(blank())}>
			<Icon name="plus" />
			{t('health.workouts.measureSomethingElse')}
		</button>
	</Field>
</FormGrid>
