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
		rhythm = $bindable('monthly')
	}: { editing?: Editing; rhythm?: string } = $props();
</script>

<div class="grid gap-3 sm:grid-cols-2">
	<label class="block text-sm">
		<span class="text-gray-600">{t('ui.name')}</span>
		<OneLine
			name="heading"
			placeholder={t('finance.bills.rent')}
			value={editing?.name ?? ''}
			class="input mt-1 w-full"
			required
			autofocus
		/>
	</label>
	<label class="block text-sm">
		<span class="text-gray-600">{t('finance.bills.expectedAmount')}</span>
		<input
			name="amount"
			inputmode="decimal"
			value={editing ? asDecimal(editing.amountExpected) : ''}
			class="input mt-1 w-full"
			placeholder="0,00"
		/>
	</label>
	<label class="block text-sm">
		<span class="text-gray-600">{t('finance.bills.rhythm')}</span>
		<select
			name="rhythm"
			class="select mt-1 w-full"
			value={editing?.rhythm ?? 'monthly'}
			onchange={(e) => (rhythm = (e.currentTarget as HTMLSelectElement).value)}
		>
			{#each RHYTHMS as r (r.value)}<option value={r.value}>{t(r.label)}</option>{/each}
		</select>
	</label>
	<!-- One question, asked in the rhythm's own terms: a weekly bill falls on a
	     weekday, a yearly one on a date, a monthly one on a day. -->
	{#if rhythm === 'weekly'}
		<label class="block text-sm">
			<span class="text-gray-600">{t('finance.bills.dueOn')}</span>
			<select name="dueDay" class="select mt-1 w-full" value={editing?.dueDay ?? 5}>
				{#each WEEKDAYS as d (d.value)}<option value={d.value}>{t(d.label)}</option>{/each}
			</select>
			<span class="mt-1 block text-xs text-gray-500">{t('finance.bills.theLastDayItCan')}</span>
		</label>
	{:else if rhythm === 'yearly'}
		<label class="block text-sm">
			<span class="text-gray-600">{t('finance.bills.dueMonth')}</span>
			<select name="dueMonth" class="select mt-1 w-full" value={editing?.dueMonth ?? 1}>
				{#each MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
			</select>
		</label>
		<label class="block text-sm">
			<span class="text-gray-600">{t('finance.bills.dueDayOfThatMonth')}</span>
			<NumberBox
				name="dueDay"
				min="1"
				max="28"
				value={editing?.dueDay ?? ''}
				class="mt-1 w-full"
				placeholder="15"
			/>
			<span class="mt-1 block text-xs text-gray-500">{t('finance.bills.theLastDayItCan')}</span>
		</label>
	{:else}
		<label class="block text-sm">
			<span class="text-gray-600">{t('finance.bills.dueDayOfTheMonth')}</span>
			<NumberBox
				name="dueDay"
				min="1"
				max="28"
				value={editing?.dueDay ?? ''}
				class="mt-1 w-full"
				placeholder="5"
			/>
			<span class="mt-1 block text-xs text-gray-500">{t('finance.bills.theLastDayItCan')}</span>
		</label>
	{/if}
	<label class="block text-sm">
		<span class="text-gray-600">{t('finance.bills.payItThisManyDays')}</span>
		<NumberBox
			name="payLeadDays"
			min="0"
			max="27"
			value={editing?.payLeadDays ?? 0}
			class="mt-1 w-full"
			placeholder="0"
		/>
		<span class="mt-1 block text-xs text-gray-500">
			{t('finance.bills.whenItTurnsUpOn')}
		</span>
	</label>
</div>
