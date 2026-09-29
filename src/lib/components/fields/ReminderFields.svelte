<script lang="ts">
	/**
	 * A reminder about nothing but itself: a day, a time, what to say, a sound.
	 *
	 * The reminders page and the quick add sheet both set one, so the fields
	 * and every rule about them live here rather than twice — which day it may
	 * be, the time it suggests once today's opening hour has gone, why a time
	 * will not do. Drawn inside a `FormGrid`; whatever submits goes at the end
	 * of the sound row, through `action`.
	 */
	import type { Snippet } from 'svelte';
	import Field from '$lib/components/Field.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import ReminderWhyNot from '$lib/components/ReminderWhyNot.svelte';
	import { openPicker } from '$lib/open-picker';
	import { useT } from '$lib/i18n';
	import { timeOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { floorOf, hasBeen, isTooSoon, soonest, type ReminderClock } from '$lib/reminder-clock';

	/**
	 * How often the form re-reads the time. A minute is the resolution the
	 * floor is expressed in; anything finer would redraw it for no visible
	 * change.
	 */
	const TICK_MS = 30_000;

	let {
		clock,
		ringtones = [],
		day = $bindable(''),
		time = $bindable(''),
		say = $bindable(''),
		audible = $bindable(false),
		/** Whether what is in the fields is something the server would take. */
		// `$bindable()` is a compiler directive, not an assignment: this is only
		// ever written from here, which is what the rule mistakes it for.
		// eslint-disable-next-line no-useless-assignment
		ready = $bindable(false),
		action = undefined
	}: {
		clock: ReminderClock;
		ringtones?: { id: number; name: string }[];
		day?: string;
		time?: string;
		say?: string;
		audible?: boolean;
		ready?: boolean;
		action?: Snippet;
	} = $props();

	const t = useT();
	const now = useWhen();

	/*
	 * How long ago the clock was read, kept honest as the form sits open: the
	 * floor moves on with the time, so a form left open does not keep offering
	 * one from an hour ago.
	 */
	let opened = $state(Date.now());
	let since = $state(0);
	$effect(() => {
		// A new clock is a fresh reading.
		void clock;
		opened = Date.now();
		since = 0;
		const beat = setInterval(() => (since = Date.now() - opened), TICK_MS);
		return () => clearInterval(beat);
	});

	const floorAt = $derived(floorOf(clock, since));
	/** The day part of that, so the date field cannot offer a day already gone. */
	const earliestDay = $derived(floorAt.slice(0, 10));
	const dayStartSaid = $derived(timeOf(`2000-01-01T${clock.dayStart}`, now()));

	// Today, so the day field opens on a real date rather than on nothing.
	$effect(() => {
		if (!day) day = clock.today;
	});

	/*
	 * The time is not part of it: an empty one means the hour the day starts,
	 * which is a real answer rather than a missing one.
	 */
	$effect(() => {
		ready = Boolean(
			day && say.trim() && !hasBeen(clock, since, day, time) && !isTooSoon(clock, since, day, time)
		);
	});

	/**
	 * The time this form filled in, as opposed to one somebody typed.
	 *
	 * The difference is the whole of the rule below: a suggestion follows the
	 * day it was made for, and an answer never moves.
	 */
	let suggested = '';

	/*
	 * A form that opens dead is a form that looks broken.
	 *
	 * The day starts as today and the time starts empty, and empty means the
	 * hour the planner opens on — which by the afternoon has been. So it
	 * suggests a time, and only when it has to: leaving it empty is still what
	 * "the hour my day starts" means for every day that has not begun. And the
	 * suggestion is withdrawn when the day moves to one where empty is a real
	 * answer again — otherwise choosing today, then tomorrow, leaves this
	 * afternoon's guess behind as tomorrow's answer.
	 */
	$effect(() => {
		if (!day) return;
		if (hasBeen(clock, since, day, '')) {
			if (time && time !== suggested) return;
			suggested = soonest(clock, since);
			time = suggested;
			return;
		}
		if (time && time === suggested) {
			time = '';
			suggested = '';
		}
	});
</script>

<!--
	A day and a time, not one field with six segments in it.

	`datetime-local` renders as `dd/mm/yyyy, --:--` — one control carrying two
	different questions, which is why it was both ugly and the widest thing on
	the row. Two fields say the same thing, fit a phone, and let somebody set a
	time for today without touching the date at all.
-->
<Field label={t('reminders.day')} span={6} required>
	<input
		name="day"
		type="date"
		required
		min={earliestDay}
		autocomplete="off"
		bind:value={day}
		onfocus={openPicker}
		onclick={openPicker}
		title={t('reminders.whichDayItShouldGo')}
		class="input"
	/>
</Field>
<Field
	label={t('reminders.time')}
	span={6}
	hint={t('reminders.emptyMeansDayStart', { at: dayStartSaid })}
>
	<!--
		The browser's own time field, whatever it draws: a standard control is
		the browser's to draw, and the app's real destination is an installed
		Android app, where this is the good one.

		`min` only on the first day it could be. A time field's `min` is a time
		of day, not an instant — so on any later day it would forbid the morning
		for no reason.
	-->
	<input
		name="time"
		type="time"
		autocomplete="off"
		bind:value={time}
		min={day === earliestDay ? floorAt.slice(11, 16) : undefined}
		title={t('reminders.whatTimeItShouldGo', { dayStart: dayStartSaid })}
		class="input"
	/>
</Field>
<Field label={t('reminders.whatToSay')} span={12} required>
	<OneLine
		name="label"
		required
		bind:value={say}
		placeholder={t('reminders.eGTakeTheBreadOut')}
		class="input"
	/>
</Field>

<div class="col-span-12">
	<ReminderWhyNot {clock} {since} {day} {time} />
</div>

<div class="col-span-12 flex flex-wrap items-center gap-4">
	<label
		class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
		title={t('reminders.playASoundAsWell')}
	>
		<input type="checkbox" name="audible" bind:checked={audible} class="size-4" />
		{t('reminders.makeASound')}
	</label>
	<label
		class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
		title={t('reminders.whichSoundThisOnePlays')}
	>
		{t('reminders.sound')}
		<select name="ringtoneId" class="select w-44">
			<option value="">{t('reminders.default')}</option>
			{#each ringtones as tone (tone.id)}
				<option value={tone.id}>{tone.name}</option>
			{/each}
		</select>
	</label>
	{@render action?.()}
</div>
