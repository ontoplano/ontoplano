<script lang="ts">
	/**
	 * How long before a block starts to be nudged about it.
	 *
	 * A reminder is a property of the thing being planned — "tell me ten
	 * minutes before gym" — said once where the block is, rather than as a
	 * clock reading on a page of its own. It is asked in two places now: the
	 * planner's own block form, and the dialog that puts a task on a day,
	 * which is the same act with the reminder left out.
	 *
	 * **A list and a box, not one or the other.** The list is what anybody
	 * picks nine times out of ten, and hunting for "10" in a number field is
	 * worse than tapping it. But "the usual few" is a guess about somebody
	 * else's life — 45 minutes for a commute, three hours for a flight — so
	 * the list writes into the box rather than replacing it, and the box is
	 * what is submitted.
	 */
	import NumberBox from '$lib/components/NumberBox.svelte';
	import Field from '$lib/components/Field.svelte';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	const t = useT();

	let {
		value = $bindable(0),
		name = 'remindLeadMinutes',
		span = 12,
		/** What the field is called; the planner says it applies to every occurrence. */
		hint = 'tasks.plan.minutesBeforeItStarts'
	}: {
		value?: number | string;
		name?: string;
		span?: 3 | 4 | 6 | 8 | 12;
		hint?: PlainKey;
	} = $props();

	/** The few worth a chip: nothing, a few minutes, half an hour, an hour, a day. */
	const OFFERED = [0, 5, 10, 30, 60, 1440];

	function leadLabel(minutes: number): string {
		if (minutes === 0) return t('tasks.plan.notAtAll');
		if (minutes < 60) return t('tasks.plan.leadMinutes', { count: minutes });
		if (minutes === 1440) return t('tasks.plan.aDay');
		return minutes % 60 === 0
			? t('tasks.plan.leadHours', { count: minutes / 60 })
			: t('tasks.plan.leadHoursMinutes', {
					hours: Math.floor(minutes / 60),
					minutes: minutes % 60
				});
	}
</script>

<Field label={t('tasks.plan.remindMe')} {span} hint={t(hint)}>
	<div class="flex flex-wrap items-center gap-2">
		<NumberBox
			autocomplete="off"
			{name}
			min="0"
			max="1440"
			step="5"
			bind:value
			placeholder="0"
			class="w-28"
			aria-label={t('tasks.plan.minutesBeforeItStarts')}
		/>
		<div class="flex flex-wrap gap-1">
			{#each OFFERED as minutes (minutes)}
				<button
					type="button"
					class="chip"
					aria-pressed={Number(value) === minutes}
					onclick={() => (value = minutes)}
				>
					{leadLabel(minutes)}
				</button>
			{/each}
		</div>
	</div>
</Field>
