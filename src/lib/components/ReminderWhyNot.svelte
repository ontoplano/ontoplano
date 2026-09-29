<script lang="ts">
	/**
	 * Why this time will not do — both reasons, in one place.
	 *
	 * A time already gone and a time too close are the same shape of problem
	 * from the person's side: they typed something and it will not be taken.
	 * The server refuses both (`remindAtFrom` and `notTooSoon`), and being told
	 * after pressing save is a worse way to learn a rule than seeing it here
	 * first. Said where the fields are, because a disabled button with the
	 * reason only in its tooltip looks broken on a phone, which has no
	 * tooltips.
	 *
	 * Every form that sets a reminder's time draws this, so they give the same
	 * reasons in the same words.
	 */
	import { useT } from '$lib/i18n';
	import { timeOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { hasBeen, isTooSoon, type ReminderClock } from '$lib/reminder-clock';

	let {
		clock,
		/** How long ago `clock` was read, so the answer ages with the form. */
		since,
		day,
		time
	}: { clock: ReminderClock; since: number; day: string; time: string } = $props();

	const t = useT();
	const now = useWhen();

	/* The hour a dateless alarm goes off, written the way this reader reads a clock. */
	const dayStartSaid = $derived(timeOf(`2000-01-01T${clock.dayStart}`, now()));
</script>

{#if hasBeen(clock, since, day, time)}
	<p class="text-sm text-gray-600">
		{time
			? t('reminders.thatTimeHasAlreadyBeen')
			: t('reminders.dayStartHasAlreadyBeen', { at: dayStartSaid })}
		{t('reminders.giveItALaterOne')}
	</p>
{:else if isTooSoon(clock, since, day, time)}
	<p class="text-sm text-gray-600">
		{t('reminders.atLeastMinutesFromNow', { count: clock.leadMinutes })}
		<span class="block text-xs text-gray-500">
			{t('reminders.whyTheFloor', { count: clock.leadMinutes })}
		</span>
	</p>
{/if}
