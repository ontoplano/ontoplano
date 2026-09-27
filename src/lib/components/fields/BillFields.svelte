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
		automatic?: boolean;
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
		notebooks?: { id: number; title: string; modules: readonly string[] }[];
		startingNotebook?: number | null;
	} = $props();

	/*
	 * Whether it pays itself, and how early it wants paying when it does not.
	 *
	 * Seeded once from the bill being edited: the form is mounted fresh for
	 * each bill, and a live link to the prop would undo a tick the moment the
	 * page reloaded its data underneath.
	 */
	// svelte-ignore state_referenced_locally
	let automatic = $state(editing?.automatic ?? false);
	// svelte-ignore state_referenced_locally
	let payLeadDays = $state<number | string | null>(editing?.payLeadDays ?? 0);
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

	<!--
		The lead, with the box that makes it moot beside it.

		A group rather than a label: a label wrapping the checkbox and the number
		would lend its words to both, and pressing "Pay it this many days before"
		would tick Automatic. The number is disabled rather than removed, and both
		hints hold the same cell, so ticking the box moves nothing on the form.
		A disabled field does not post, so the lead rides in a hidden one and
		survives the bill being made automatic and back.
	-->
	<Field label={t('finance.bills.payItThisManyDays')} span={6} group>
		<div class="flex items-center gap-3">
			<label class="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-gray-700">
				<input
					type="checkbox"
					name="automatic"
					class="h-4 w-4"
					bind:checked={automatic}
					data-tour="bill-automatic"
				/>
				{t('finance.bills.automatic')}
			</label>
			<NumberBox
				name={automatic ? undefined : 'payLeadDays'}
				min="0"
				max="27"
				bind:value={payLeadDays}
				placeholder="0"
				disabled={automatic}
				aria-label={t('finance.bills.payItThisManyDays')}
				class="min-w-0 flex-1"
			/>
			{#if automatic}<input type="hidden" name="payLeadDays" value={payLeadDays ?? 0} />{/if}
		</div>
		<span class="mt-1 grid text-xs text-gray-500">
			<span class="col-start-1 row-start-1" class:invisible={automatic} aria-hidden={automatic}>
				{t('finance.bills.whenItTurnsUpOn')}
			</span>
			<span class="col-start-1 row-start-1" class:invisible={!automatic} aria-hidden={!automatic}>
				{t('finance.bills.youWontBeReminded')}
			</span>
		</span>
	</Field>

	<NotebookField
		{notebooks}
		holds="bills"
		value={editing?.notebookId ?? startingNotebook}
		span={6}
	/>
</FormGrid>
