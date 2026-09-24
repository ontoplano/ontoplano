<script lang="ts">
	/**
	 * What a bill is made of.
	 *
	 * One definition, two places: the Finance room's dialog and a notebook's
	 * Bills tab. They were one form and a thinner copy of it, so a bill written
	 * against a subject could not say when it falls due — which is most of what
	 * a bill is.
	 *
	 * The same move as `IdeaFields` and `NotebookFields`: the fields live with
	 * the thing, not with one screen.
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { MONTHS, RHYTHMS, WEEKDAYS, asDecimal } from '$lib/bill-summary';
	import { useT } from '$lib/i18n';

	const t = useT();

	type Editing = {
		id: number;
		name: string;
		amountExpected: number;
		rhythm: string;
		dueDay: number | null;
		dueMonth: number | null;
		payLeadDays: number;
		notebookId?: number | null;
	} | null;

	let {
		editing = null,
		/**
		 * The rhythm the form is on, so its due-day field asks the right thing.
		 *
		 * Bound, because the page's own heading reads it too — a weekly bill
		 * falls on a weekday and a yearly one on a date, and the question has to
		 * change as the answer does.
		 */
		rhythm = $bindable('monthly'),
		notebooks = [],
		/** The notebook a bill written from inside one belongs to. */
		startingNotebook = null
	}: {
		editing?: Editing;
		rhythm?: string;
		notebooks?: { id: number; title: string }[];
		startingNotebook?: number | null;
	} = $props();
</script>

<FormGrid>
	<Field label={t('ui.name')} span={6} required>
		<OneLine
			name="heading"
			placeholder={t('finance.bills.rent')}
			value={editing?.name ?? ''}
			class="input"
			required
			autofocus
		/>
	</Field>

	<Field label={t('finance.bills.expectedAmount')} span={6}>
		<input
			name="amount"
			inputmode="decimal"
			value={editing ? asDecimal(editing.amountExpected) : ''}
			class="input"
			placeholder="0,00"
		/>
	</Field>

	<Field label={t('finance.bills.rhythm')} span={6}>
		<select
			name="rhythm"
			class="select"
			value={editing?.rhythm ?? 'monthly'}
			onchange={(e) => (rhythm = (e.currentTarget as HTMLSelectElement).value)}
		>
			{#each RHYTHMS as r (r.value)}<option value={r.value}>{t(r.label)}</option>{/each}
		</select>
	</Field>

	<!-- One question, asked in the rhythm's own terms: a weekly bill falls on a
	     weekday, a yearly one on a date, a monthly one on a day. -->
	{#if rhythm === 'weekly'}
		<Field label={t('finance.bills.dueOn')} span={6} hint={t('finance.bills.theLastDayItCan')}>
			<select name="dueDay" class="select" value={editing?.dueDay ?? 5}>
				{#each WEEKDAYS as d (d.value)}<option value={d.value}>{t(d.label)}</option>{/each}
			</select>
		</Field>
	{:else if rhythm === 'yearly'}
		<Field label={t('finance.bills.dueMonth')} span={3}>
			<select name="dueMonth" class="select" value={editing?.dueMonth ?? 1}>
				{#each MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
			</select>
		</Field>
		<Field
			label={t('finance.bills.dueDayOfThatMonth')}
			span={3}
			hint={t('finance.bills.theLastDayItCan')}
		>
			<NumberBox name="dueDay" min="1" max="28" value={editing?.dueDay ?? ''} placeholder="15" />
		</Field>
	{:else}
		<Field
			label={t('finance.bills.dueDayOfTheMonth')}
			span={6}
			hint={t('finance.bills.theLastDayItCan')}
		>
			<NumberBox name="dueDay" min="1" max="28" value={editing?.dueDay ?? ''} placeholder="5" />
		</Field>
	{/if}

	<Field
		label={t('finance.bills.payItThisManyDays')}
		span={6}
		hint={t('finance.bills.whenItTurnsUpOn')}
	>
		<NumberBox
			name="payLeadDays"
			min="0"
			max="27"
			value={editing?.payLeadDays ?? 0}
			placeholder="0"
		/>
	</Field>

	<NotebookField {notebooks} value={editing?.notebookId ?? startingNotebook} span={6} />
</FormGrid>
