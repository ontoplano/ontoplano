<script lang="ts">
	/**
	 * What a habit is made of.
	 *
	 * One definition, two places: the Health room's dialog and a notebook's
	 * Habits tab — the same reason `IdeaFields` and `BillFields` exist. The
	 * kind and the days are the whole of what makes a habit behave the way it
	 * does: a bad one counts days since the last slip, a good one counts the
	 * scheduled days kept.
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { FULL_DAY_LABELS } from '$lib/habit-heatmap';
	import { useT } from '$lib/i18n';

	const t = useT();

	type Editing = {
		name: string;
		description: string | null;
		scheduledDays: string | null;
		notebookId?: number | null;
	} | null;

	let {
		editing = null,
		/** The kind the form is on: it decides the placeholder and the days field. */
		kind = $bindable<'bad' | 'good' | 'neutral'>('bad'),
		/** One per weekday, Monday first — the shape `scheduledDays` is stored in. */
		days = $bindable<boolean[]>([false, false, false, false, false, false, false]),
		notebooks = [],
		/** The notebook a habit kept against one subject belongs to. */
		startingNotebook = null
	}: {
		editing?: Editing;
		kind?: 'bad' | 'good' | 'neutral';
		days?: boolean[];
		notebooks?: { id: number; title: string }[];
		startingNotebook?: number | null;
	} = $props();

	/** The stored spelling: the indexes that are on, comma separated. */
	const scheduled = $derived(
		days
			.map((on, i) => (on ? i : -1))
			.filter((i) => i !== -1)
			.join(',')
	);

	const KINDS: { value: 'bad' | 'good' | 'neutral'; label: string }[] = [
		{ value: 'bad', label: 'Bad' },
		{ value: 'good', label: 'Good' },
		{ value: 'neutral', label: 'Neutral' }
	];
</script>

<input type="hidden" name="scheduledDays" value={scheduled} />

<FormGrid>
	<Field label={t('ui.name')} span={12} required>
		<OneLine
			name="label"
			placeholder={kind === 'bad'
				? t('health.habits.eGSmokingBitingNails')
				: kind === 'neutral'
					? t('health.habits.eGCoffeeNaps')
					: t('health.habits.eGGymReading')}
			value={editing?.name ?? ''}
			class="input"
			required
		/>
	</Field>

	<Field label={t('health.habits.kind')} span={12} hint={t('health.habits.aBadHabitCountsDays')}>
		<div class="flex gap-2">
			{#each KINDS as option (option.value)}
				<label
					class="flex-1 cursor-pointer border px-3 py-2 text-center text-sm {kind === option.value
						? 'on-fill font-medium'
						: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
				>
					<input
						type="radio"
						name="type"
						value={option.value}
						checked={kind === option.value}
						onchange={() => (kind = option.value)}
						class="sr-only"
					/>
					{option.label}
				</label>
			{/each}
		</div>
	</Field>

	<Field label={t('ui.description')} span={6}>
		<OneLine name="description" value={editing?.description ?? ''} class="input" />
	</Field>

	<NotebookField {notebooks} value={editing?.notebookId ?? startingNotebook} span={6} />

	<!-- Only where it means something: a bad habit is not on a schedule, it is
	     a thing you are counting the days since. -->
	{#if kind === 'good' || kind === 'neutral'}
		<Field
			label={t('health.habits.onWhichDays')}
			span={12}
			hint={t('health.habits.noneSelectedMeansEveryDay')}
		>
			<div class="flex flex-wrap gap-1">
				{#each FULL_DAY_LABELS as label, i (label)}
					<label
						class="cursor-pointer border px-2 py-1 text-xs {days[i]
							? 'on-fill font-medium'
							: 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}"
					>
						<input
							type="checkbox"
							checked={days[i]}
							onchange={(e) => (days[i] = (e.target as HTMLInputElement).checked)}
							class="sr-only"
						/>
						{label}
					</label>
				{/each}
			</div>
		</Field>
	{/if}
</FormGrid>
