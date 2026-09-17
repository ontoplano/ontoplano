<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import { inPhoneApp } from '$lib/instance-choice';
	import {
		askPhoneToNotify,
		openPhoneNotificationSettings,
		phonePermission
	} from '$lib/phone-notifications';
	import Card from '$lib/components/Card.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { alarmsChanged } from '$lib/alarms';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import OneLine from '$lib/components/OneLine.svelte';
	import { armed } from '$lib/actions/armed';
	import { enablePush, pushSupported } from '$lib/push';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { ActionData, PageServerData } from './$types';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * Everything with a time on it.
	 *
	 * Reminders were scattered — a block carried one, a birthday made one — and
	 * the only way to see what was coming was to wait for it. This is the list,
	 * and the place to set one that is about nothing at all.
	 */
	/**
	 * What each kind is called, and what it looks like.
	 *
	 * A glyph per kind rather than the same clock six times: a list where every
	 * row carries the identical icon is a list where the icon column is wasted,
	 * and "which of these is a bill" is the question somebody scanning it is
	 * actually asking. A cake is a birthday everywhere; a wallet is money.
	 */
	const KINDS: Record<string, { label: PlainKey; icon: IconName }> = {
		instance: { label: 'app.blocks', icon: 'planner' },
		todo: { label: 'app.todos', icon: 'check' },
		free: { label: 'app.alarms', icon: 'clock' },
		review: { label: 'app.theWeeklyReview', icon: 'book' },
		bill: { label: 'app.bills', icon: 'wallet' },
		person: { label: 'app.birthdays', icon: 'cake' },
		day: { label: 'app.theEndOfTheDay', icon: 'moon' }
	};

	const kindOf = (key: string) => KINDS[key] ?? { label: key, icon: 'clock' as IconName };

	/**
	 * The windows worth a button. Anything else goes in the box beside them.
	 *
	 * One and three are here because "what is today" and "what is this weekend"
	 * are the two questions somebody actually opens this page with; a week was
	 * the shortest answer on offer and it is longer than either of them.
	 */
	const WINDOWS = [1, 3, 5, 7, 15, 30, 60];

	/**
	 * Whether this browser can be reached at all.
	 *
	 * Everything about a notification — the permission, the service worker,
	 * installing the app — needs a secure context, and the browser signals that
	 * by making the APIs not exist rather than by refusing. So the page has to
	 * check the context itself, or it silently offers something that cannot work.
	 */
	let insecure = $state(false);
	let origin = $state('');

	/**
	 * Whether this browser has been told it may interrupt.
	 *
	 * The ask lives here rather than floating over the app, because this is the
	 * page somebody is on when they have decided they want to be reminded — and
	 * a browser will only take the question from a click, so it has to be a
	 * button somewhere. Read once on mount: `Notification` does not exist at all
	 * in an insecure context, and asking during render would run on the server.
	 */
	let allowed = $state(true);
	let asking = $state(false);

	/**
	 * Whether Android has refused for good, which is a different button.
	 *
	 * After two noes the permission dialog is never shown again: asking a third
	 * time returns "denied" without anything appearing on screen, so an "Allow
	 * notifications" button there is a button that does nothing. That state gets
	 * the settings screen instead.
	 */
	let refused = $state(false);

	/**
	 * …and whether this page can talk to the phone at all.
	 *
	 * The shell injects its plugins into its own origin and no further, so an
	 * instance shown inside the app cannot ask Android anything. Offering
	 * "Allow notifications" there is offering a button that cannot work, and
	 * saying Android refused is saying something nobody knows.
	 */
	let unreachable = $state(false);

	/**
	 * Permission and a push subscription are two different things, and both are
	 * asked for at once. Granting permission alone raises notifications while the
	 * app is open and nothing whatsoever once it is closed, which is the state
	 * this whole feature exists to leave.
	 */
	async function allow() {
		asking = true;
		try {
			// In the phone app it is Android being asked, not the browser: this
			// web view has no Push API to subscribe to, and the alarms are booked
			// with the system instead.
			if (inPhoneApp()) {
				allowed = await askPhoneToNotify(t);
				refused = !allowed;
			} else await enablePush(page.data.pushKey ?? null);
		} finally {
			asking = false;
			if (!inPhoneApp())
				allowed = typeof Notification !== 'undefined' && Notification.permission === 'granted';
		}
	}

	/** The alarm being written, so the button can know whether it is ready. */
	let day = $state('');
	let time = $state('');
	let say = $state('');
	let audible = $state(false);
	// The time is not part of it: an empty one means the hour the day starts,
	// which is a real answer rather than a missing one.
	const ready = $derived(Boolean(day && say.trim() && !hasBeen(day, time)));

	/**
	 * Whether a day and a time have already gone by.
	 *
	 * `data.now` is the account's own wall clock to the minute, in the same
	 * shape a reminder's time is stored in, so the two compare as strings. An
	 * empty time means the hour the day starts — which can itself be behind:
	 * "today", left alone, at three in the afternoon.
	 *
	 * From the page it stops a form being filled in and handed back; the
	 * service refuses it as well, because a page's clock is a page's clock.
	 */
	function hasBeen(when: string, at: string): boolean {
		if (!when) return false;
		return `${when}T${at || data.dayStart}` <= data.now;
	}

	/**
	 * How far ahead the form suggests, when today's opening hour has gone.
	 *
	 * A quarter of an hour: long enough to still be ahead by the time somebody
	 * has finished typing, short enough to mean "shortly".
	 */
	const SOONEST_MINUTES = 15;

	/**
	 * The next quarter hour, as this account's own clock reads it.
	 *
	 * Rounded up rather than added to the minute, because a suggestion that
	 * says 15:07 is a number somebody has to think about; 15:15 is one they
	 * accept or replace.
	 */
	function soonest(): string {
		const [hour, minute] = data.now.slice(11, 16).split(':').map(Number);
		const at = hour * 60 + minute + SOONEST_MINUTES;
		const rounded = Math.ceil(at / SOONEST_MINUTES) * SOONEST_MINUTES;
		// The far end of the day rather than tomorrow: the day field says which
		// day, and moving it from under somebody is worse than a tight time.
		if (rounded >= 24 * 60) return '23:59';
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
	}

	/**
	 * The time this page filled in, as opposed to one somebody typed.
	 *
	 * The difference is the whole of the rule below: a suggestion follows the
	 * day it was made for, and an answer never moves.
	 */
	let suggested = $state('');

	/*
	 * A form that opens dead is a form that looks broken.
	 *
	 * The day starts as today and the time starts empty, and empty means the
	 * hour the planner opens on — which by the afternoon has been. So the page
	 * offered a filled-in day, a disabled button and a line explaining why, to
	 * somebody who had not typed anything yet.
	 *
	 * It suggests a time instead, and only when it has to: leaving it empty is
	 * still what "the hour my day starts" means for every day that has not
	 * begun. And the suggestion is withdrawn when the day moves to one where
	 * empty is a real answer again — otherwise choosing today, then tomorrow,
	 * leaves this afternoon's guess behind as tomorrow's answer.
	 */
	$effect(() => {
		if (!day) return;
		if (hasBeen(day, '')) {
			if (time && time !== suggested) return;
			suggested = soonest();
			time = suggested;
			return;
		}
		if (time && time === suggested) {
			time = '';
			suggested = '';
		}
	});

	/**
	 * Open the browser's own picker rather than the text field behind it.
	 *
	 * A date or time input is a row of typeable segments with a small icon
	 * beside it, and on a phone the icon is the only part anybody wants. This
	 * throws where the browser refuses — it insists on a real user gesture, and
	 * some do not implement it at all — in which case the field behaves as it
	 * always did.
	 */
	function pick(event: Event & { currentTarget: HTMLInputElement }) {
		try {
			event.currentTarget.showPicker?.();
		} catch {
			// Not allowed here; the field still works.
		}
	}

	// Seeded from the window in the address and re-seeded when it changes, so
	// pressing 30 leaves the box saying 30 rather than whatever was typed last.
	/** Whether the phone's how-far dialog is open. */
	let ranging = $state(false);
	let howFar = $state<number>(0);
	$effect(() => {
		howFar = data.days;
	});

	// Today, once the page has it, so the day field opens on a real date rather
	// than on nothing.
	$effect(() => {
		if (!day) day = data.today;
	});

	/**
	 * Look further ahead without moving the page.
	 *
	 * These were links, and a link is a navigation: SvelteKit puts you back at
	 * the top of the document, which on a phone means pressing "30" throws you
	 * away from the control you just pressed. `noScroll` and `keepFocus` say
	 * that the address changed and nothing else did — which is the truth, since
	 * only one card's contents depend on it.
	 */
	function look(days: number, past = data.past) {
		const wanted = Math.max(1, Math.min(data.maxDays, Math.trunc(days) || data.days));
		howFar = wanted;
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/reminders')}?days=${wanted}${past ? '&past=1' : ''}`, {
			noScroll: true,
			keepFocus: true,
			replaceState: true
		});
	}

	onMount(() => {
		insecure = !window.isSecureContext;
		origin = `${location.protocol}//${location.host}`;
		if (inPhoneApp())
			phonePermission().then((answer) => {
				allowed = answer === 'granted';
				refused = answer === 'denied';
				unreachable = answer === 'unreachable';
			});
		else allowed = typeof Notification !== 'undefined' && Notification.permission === 'granted';
	});

	/**
	 * What is coming: the rows that exist and the ones that do not yet.
	 *
	 * A birthday becomes a row on the morning of it and a bill on the day it
	 * wants paying, which is right for firing them and useless for showing
	 * somebody what is ahead. The derived ones have no id, so they carry no
	 * buttons — there is nothing to dismiss about a birthday in November.
	 */
	type Listed = {
		key: string;
		id: number | null;
		message: string;
		remindAt: string;
		subjectKind: string;
		shown: boolean;
		/** Whether it will make a noise, which is worth seeing before it does. */
		audible: boolean;
		/**
		 * What the row itself says about sound, which is not the same question.
		 *
		 * Null is "whatever this kind does", and an editor has to be able to
		 * show that and put it back — a resolved boolean cannot tell a reminder
		 * that was silenced from one that is silent because bills are.
		 */
		chosen: { audible: boolean | null; ringtoneId: number | null };
	};

	const upcoming = $derived<Listed[]>(
		[
			...data.reminders
				// A dismissed reminder is hidden from what is coming and is the
				// whole point of looking back — "did I actually deal with that?"
				.filter((r) => data.past || !r.dismissedAt)
				.map((r) => ({
					key: `set:${r.id}`,
					id: r.id,
					message: r.message,
					remindAt: r.remindAt,
					subjectKind: r.subjectKind,
					shown: Boolean(r.deliveredAt),
					audible: r.audible,
					chosen: r.chosen
				})),
			...data.upcoming.map((u, i) => ({
				key: `soon:${i}`,
				id: null,
				message: u.message,
				remindAt: u.at,
				subjectKind: u.kind,
				shown: false,
				// Not a row yet, so it carries nothing of its own — what it will
				// sound like is whatever its kind is set to on the day.
				audible: data.sounds.find((c) => c.kind === u.kind)?.audible ?? false,
				chosen: { audible: null, ringtoneId: null }
			}))
		].sort((a, b) =>
			// Looking back, the one you want is the last one that fired.
			data.past ? b.remindAt.localeCompare(a.remindAt) : a.remindAt.localeCompare(b.remindAt)
		)
	);

	function when(at: string): string {
		const d = new Date(at.length === 16 ? at + ':00' : at);
		return d.toLocaleString(t.locale, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	let confirmingDelete = $state<number | null>(null);

	/**
	 * The one being changed, and the answers it started with.
	 *
	 * A reminder used to be a thing you could make and unmake and nothing in
	 * between, so moving an alarm five minutes or giving a silent one a sound
	 * meant deleting it and typing it out again. The editor is the same four
	 * questions the form above asks, opened on the row itself: it is one
	 * reminder being changed, and a form somewhere else on the page would leave
	 * somebody wondering which one it was about.
	 *
	 * Held here rather than in each row so that opening one closes the last —
	 * two open editors are two answers to "what am I changing".
	 */
	let editing = $state<number | null>(null);

	/** Whether the "set one" dialog is open. */
	let setting = $state(false);
	let editDay = $state('');
	let editTime = $state('');
	let editSay = $state('');
	/** "kind" is the row saying nothing and following its kind's setting. */
	let editSound = $state<'kind' | 'on' | 'off'>('kind');
	let editTone = $state('');

	function edit(reminder: Listed) {
		if (reminder.id === null) return;
		confirmingDelete = null;
		editing = reminder.id;
		editDay = reminder.remindAt.slice(0, 10);
		editTime = reminder.remindAt.slice(11, 16);
		editSay = reminder.message;
		editSound =
			reminder.chosen.audible === null ? 'kind' : reminder.chosen.audible === true ? 'on' : 'off';
		editTone = reminder.chosen.ringtoneId === null ? '' : String(reminder.chosen.ringtoneId);
	}
	/** Playing one, so choosing a sound does not mean setting an alarm to hear it. */
	let audio: HTMLAudioElement | undefined = $state();

	function preview(url: string) {
		if (!audio) return;
		audio.src = url;
		void audio.play().catch(() => {
			/* a browser that will not play without a gesture is not an error */
		});
	}
</script>

<!--
	Why the button is dead, said where the fields are.

	A disabled control with the reason only in its tooltip is a control that
	looks broken on a phone, which has no tooltips — and the commonest way to
	land here is the form's own default: today, no time, opened in the
	afternoon, when the hour the day starts has been for hours.
-->
{#snippet alreadyBeen(when: string, at: string)}
	{#if hasBeen(when, at)}
		<p class="text-sm text-gray-600">
			{at ? t('reminders.thatTimeHasAlreadyBeen') : `${data.dayStart} has already been today.`}
			{t('reminders.giveItALaterOne')}
		</p>
	{/if}
{/snippet}

<svelte:head><title>{t('reminders.remindersOntoplano')}</title></svelte:head>

<audio bind:this={audio} class="hidden"></audio>

<div class="space-y-4">
	<RoomBar title={t('reminders.reminders')}>
		{#snippet actions()}
			<!--
				Where every other room keeps the thing that makes one.

				This sat on a row of its own under the bar, right-aligned, which on
				a phone is a band of empty space above the list somebody came here
				to read. The bar is the shared component and this is the shared
				habit; see `RoomBar`.
			-->
			<button
				type="button"
				class="btn btn-sm btn-primary"
				data-tour="set-alarm"
				onclick={() => (setting = true)}
			>
				<Icon name="plus" />
				{t('reminders.newReminder')}
			</button>
		{/snippet}
	</RoomBar>

	<FormError message={form?.message} />

	<!--
		Why nothing arrives, when nothing can.
		
		Notifications, service workers and installing as an app all need a secure
		context. `http://192.168.1.50:1493` is not one — `localhost` counts only
		on the machine it runs on, which is exactly what a phone on the same
		network is not. The browser's answer is to make `Notification` not exist,
		so without this the app does nothing, says nothing, and looks broken
		rather than unsupported.
	-->
	{#if insecure}
		<Banner kind="warning">
			{t('reminders.nothingCanReachThisBrowser')}
			<span class="tabular">{origin}</span>{t('reminders.onTheMachineRunning')}
			<span class="tabular">{t('reminders.localhost')}</span>
			{t('reminders.countsAsSecureFromAnother')}
			<span class="tabular">{t('reminders.makeHttpsLocal')}</span>
			{t('reminders.servesItOverHttpsWith')}
		</Banner>
	{/if}

	<!--
		The one button that makes any of this arrive.

		Only where it can work: an insecure context has no `Notification` to ask,
		and a browser with no push support gets the banner rather than a button
		that would do half the job. It disappears once granted, since permission
		is permanent and a settled question does not need a row.
	-->
	<!--
		The app, showing an instance that is not the copy it carries.

		This page cannot ask the phone anything — the shell's plugins reach its
		own origin and no further — but the INSTANCE knows, because the instance
		is what minted the key the phone rings with. So it is answered from the
		account rather than asserted: a phone that has been set up is told its
		reminders arrive with the app closed, which they do, and one that has
		not is sent to the screen that arranges it.

		It used to say, to every phone, that reminders "arrive only while
		ontoplano is open" — true before the phone could ring for a served
		instance at all, and a flat contradiction of the Preferences screen ever
		since.
	-->
	{#if !insecure && unreachable && data.ringsOnAPhone}
		<p class="mb-4 max-w-2xl text-sm leading-relaxed text-gray-500">
			{t('reminders.remindersFromHereRingOn')}
			<a href={resolve('/settings/preferences')} class="underline underline-offset-2"
				>{t('reminders.preferences')}</a
			>
			{t('reminders.stopsThatOrSetsIt')}
		</p>
	{:else if !insecure && (!allowed || unreachable)}
		<Banner kind="warning">
			<div class="flex flex-wrap items-center gap-3">
				<span>
					{#if unreachable}
						{t('reminders.thisPhoneIsNotSet')}
					{:else if refused}
						{t('reminders.androidHasRefusedNotificationsAnd')}
					{:else if inPhoneApp()}
						{t('reminders.thisPhoneHasNotBeen')}
					{:else}
						{t('reminders.thisBrowserHasNotBeen')}
					{/if}
				</span>
				{#if unreachable}
					<!-- The one press that arranges it is on Preferences: this page is
					     on the instance's origin, where the app's own plugins do not
					     reach, and the handshake needs the copy the phone carries. -->
					<a href={resolve('/settings/preferences')} class="btn btn-primary"
						>{t('reminders.setItUp')}</a
					>
				{:else if refused}
					<button type="button" class="btn btn-primary" onclick={openPhoneNotificationSettings}>
						{t('reminders.openThePhoneSSettings')}
					</button>
				{:else}
					<button type="button" class="btn btn-primary" onclick={allow} disabled={asking}>
						{asking ? 'Asking…' : t('reminders.allowNotifications')}
					</button>
				{/if}
			</div>
			<!--
				And the sentence about push, which is not the phone app's problem.

				Android's web view has no Push API, so inside the app that line was
				always shown — telling somebody who is holding the app to install it
				as an app. The app does not need push: it books the reminders with
				Android itself while it is open, and they arrive whether or not it
				is.
			-->
			{#if !pushSupported() && !inPhoneApp()}
				<p class="mt-2 text-sm">
					{t('reminders.thisBrowserHasNoPush')}
				</p>
			{/if}
		</Banner>
	{/if}

	<!--
		The alarm clock.

		A reminder about nothing: a time and a sentence. It shows wherever
		notifications are on; it only makes a noise if you say so here, because a
		thing that beeps without being asked is a thing whose sound gets turned
		off for good.
	-->
	<!--
		Setting one is a question, so it is asked in a dialog.

		It was a card at the top of the page: a form you had to scroll past
		every time you came here to look at what was already set, which is the
		commoner reason to open this screen by far.
	-->
	<Modal
		bind:open={setting}
		title={t('reminders.setOne')}
		description={t('reminders.aDayAndWhatTo')}
		size="lg"
	>
		<!--
				A day and a time, not one field with six segments in it.

				`datetime-local` renders as `dd/mm/yyyy, --:--` — one control
				carrying two different questions, which is why it was both ugly and
				the widest thing on the row. Two fields say the same thing, fit a
				phone, and let somebody set a time for today without touching the
				date at all.
			-->
		<form
			method="post"
			action="?/create"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update({ reset: false });
					// Cleared by hand rather than by `reset`, which blanks a date
					// back to nothing — the default is today, and a form that
					// forgets what day it is asks for it again every time.
					if (result.type === 'success') {
						day = data.today;
						time = '';
						say = '';
						audible = false;
						// Booked with the phone now rather than whenever the app
						// next happens to be reopened.
						alarmsChanged();
					}
				};
			}}
			class="space-y-3"
		>
			<FormGrid>
				<Field label={t('reminders.day')} span={6} required>
					<input
						name="day"
						type="date"
						required
						min={data.today}
						autocomplete="off"
						bind:value={day}
						onfocus={pick}
						onclick={pick}
						title={t('reminders.whichDayItShouldGo')}
						class="input"
					/>
				</Field>
				<Field
					label={t('reminders.time')}
					span={6}
					hint="Empty means {data.dayStart}, when your day starts."
				>
					<!--
							The browser's own time field, whatever it draws.

							There was a hand-built clock face here for a while, because
							Android opens this as typeable digits unless it feels like
							opening a dial and Firefox's `showPicker()` does nothing. It
							looked like nobody's control on every platform where the native
							one is fine, which is most of them. A standard control is the
							browser's to draw; where one browser draws it badly, that is a
							rough edge to carry rather than a widget to own — and the app's
							real destination is an installed Android app, where this is the
							good one.
						-->
					<input
						id="reminder-time"
						name="time"
						type="time"
						autocomplete="off"
						bind:value={time}
						title={t('reminders.whatTimeItShouldGo', { dayStart: data.dayStart })}
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
			</FormGrid>

			{@render alreadyBeen(day, time)}

			<div class="flex flex-wrap items-center gap-4">
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
						{#each data.ringtones as tone (tone.id)}
							<option value={tone.id}>{tone.name}</option>
						{/each}
					</select>
				</label>
				<!--
						Off until there is something to set.

						It looked pressable with the fields empty, so pressing it did
						nothing visible and read as a broken button — the browser's own
						validation message is easy to miss on a phone, and a control
						that cannot work should not look like one that can.
					-->
				<button
					type="submit"
					disabled={!ready}
					class="btn btn-primary btn-sm ml-auto"
					title={ready
						? t('reminders.setThisReminder')
						: hasBeen(day, time)
							? t('reminders.thatTimeHasAlreadyBeen2')
							: t('reminders.aDayAndSomethingTo')}
				>
					{t('reminders.setIt')}
				</button>
			</div>
		</form>
	</Modal>

	<!--
		What is coming, and how far ahead you are asking.

		The window is in the address bar rather than in a preference: it is a
		question you ask once — "and what about November?" — not a setting you
		keep, and this way the answer is a link you can send yourself.
	-->
	<Card
		title={data.past ? t('reminders.alreadyBeen') : t('reminders.comingUp')}
		description={data.past
			? t('reminders.theLastDays', { count: data.days })
			: t('reminders.theNextDays', { count: data.days })}
		flush
	>
		<div
			class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2"
			data-tour="reminder-window"
		>
			<!--
				Which way the window points.

				The same number of days, forwards or backwards. It sits first
				because it changes what every other control in this row means.
			-->
			<div class="seg" role="group" aria-label={t('reminders.whichWayToLook')}>
				<button
					type="button"
					onclick={() => look(data.days, false)}
					aria-pressed={!data.past}
					title={t('reminders.whatIsStillToCome')}
				>
					{t('reminders.ahead')}
				</button>
				<button
					type="button"
					onclick={() => look(data.days, true)}
					aria-pressed={data.past}
					title={t('reminders.whatHasAlreadyGoneOff')}
				>
					{t('reminders.past')}
				</button>
			</div>

			<!--
				On a phone: one button saying how far, and a dialog to change it.

				The seven windows, a number box and a Go button are four controls
				wrapping onto three lines above a list somebody came here to read —
				a row of furniture taller than the thing it filters. The button says
				what the window currently is, which is the only part worth standing
				space; changing it is a question, and questions are asked in dialogs
				here.
			-->
			<button
				type="button"
				class="btn btn-sm sm:hidden"
				onclick={() => (ranging = true)}
				aria-haspopup="dialog"
				title={t('reminders.changeHowFar')}
			>
				{t('reminders.daysCount', { count: data.days })}
				<Icon name="chevron-down" />
			</button>

			<!-- …and on anything wider, where the row fits, all of them at once. -->
			<div class="seg hidden sm:flex" role="group" aria-label={t('reminders.howFar')}>
				{#each WINDOWS as window (window)}
					<button
						type="button"
						onclick={() => look(window)}
						aria-pressed={data.days === window}
						title={data.past
							? t('reminders.theLastDays', { count: window })
							: t('reminders.theNextDays', { count: window })}
					>
						{window}
					</button>
				{/each}
			</div>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					look(Number(howFar));
				}}
				class="hidden items-center gap-2 sm:flex"
			>
				<label class="text-xs whitespace-nowrap text-gray-500" for="how-far"
					>{t('reminders.or')}</label
				>
				<NumberBox
					id="how-far"
					name="days"
					min="1"
					max={data.maxDays}
					bind:value={howFar}
					autocomplete="off"
					title={t('reminders.howManyDaysToCover', { maxDays: data.maxDays })}
					class="w-20"
				/>
				<span class="text-xs whitespace-nowrap text-gray-500">{t('reminders.days')}</span>
				<button type="submit" class="btn btn-sm" title={t('reminders.lookThatFar')}
					>{t('reminders.go')}</button
				>
			</form>
		</div>

		<!--
			The same windows, stacked, for the phone's button above.

			One column rather than a grid: each row is a whole sentence — "3 days"
			— and they are read down, not scanned across. The one in force is
			marked, so opening this says where you are before it asks where to go.
		-->
		<Modal bind:open={ranging} title={t('reminders.howFar')} size="sm">
			<div class="space-y-1">
				{#each WINDOWS as window (window)}
					<button
						type="button"
						class="block w-full px-3 py-2.5 text-left text-sm {data.days === window
							? 'bg-gray-100 font-medium text-gray-900'
							: 'text-gray-700 hover:bg-gray-50'}"
						aria-pressed={data.days === window}
						onclick={() => {
							ranging = false;
							look(window);
						}}
					>
						{t('reminders.daysCount', { count: window })}
					</button>
				{/each}

				<form
					onsubmit={(e) => {
						e.preventDefault();
						ranging = false;
						look(Number(howFar));
					}}
					class="flex items-center gap-2 border-t border-gray-200 pt-3"
				>
					<label class="sr-only" for="how-far-phone">{t('reminders.somethingElse')}</label>
					<NumberBox
						id="how-far-phone"
						name="days"
						min="1"
						max={data.maxDays}
						bind:value={howFar}
						autocomplete="off"
						title={t('reminders.howManyDaysToCover', { maxDays: data.maxDays })}
						class="w-24"
					/>
					<span class="flex-1 text-xs text-gray-500">{t('reminders.days')}</span>
					<button type="submit" class="btn btn-sm">{t('reminders.go')}</button>
				</form>
			</div>
		</Modal>

		{#if upcoming.length === 0}
			<EmptyState
				icon="clock"
				title={data.past ? t('reminders.nothingWentOff') : t('reminders.nothingWaiting')}
				description={data.past
					? t('reminders.remindersThatHaveAlreadyFired')
					: t('reminders.blocksWithAReminderBirthdays')}
			/>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each upcoming as reminder (reminder.key)}
					<li class="px-4 py-2">
						<div class="flex items-center gap-3">
							<span class="shrink-0 text-gray-400" title={t(kindOf(reminder.subjectKind).label)}>
								<Icon name={kindOf(reminder.subjectKind).icon} size={14} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-gray-900">{reminder.message}</span>
								<span class="flex items-center gap-1.5 text-xs text-gray-500">
									{t(kindOf(reminder.subjectKind).label)}
									{#if reminder.shown}{t('reminders.alreadyShown')}{/if}
									<!-- The one thing about a reminder you want to know before it
								     happens rather than after. -->
									{#if reminder.audible}
										<span class="text-blue-600" title={t('reminders.thisOneMakesASound')}>
											<Icon name="sound" size={12} />
										</span>
									{/if}
								</span>
							</span>
							<span class="tabular shrink-0 text-xs text-gray-500">{when(reminder.remindAt)}</span>

							{#if reminder.id === null}
								<!-- Nothing to change or remove: it is not a row, it is a date
							     in the address book or on a bill. -->
								<span class="w-14 shrink-0"></span>
							{:else if confirmingDelete === reminder.id}
								<form
									method="post"
									action="?/remove"
									use:enhance={() =>
										async ({ update }) => {
											await update();
											// A reminder that is gone must stop being an alarm.
											alarmsChanged();
										}}
									class="flex shrink-0 gap-1"
								>
									<input type="hidden" name="id" value={reminder.id} />
									<button type="submit" class="btn btn-sm btn-danger" use:armed
										>{t('reminders.confirm')}</button
									>
									<button
										type="button"
										onclick={() => (confirmingDelete = null)}
										class="btn btn-sm"
									>
										{t('ui.cancel')}
									</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => (editing === reminder.id ? (editing = null) : edit(reminder))}
									class="icon-btn shrink-0"
									title={t('reminders.changeThisReminder')}
									aria-label={t('reminders.change', { message: reminder.message })}
									aria-expanded={editing === reminder.id}
								>
									<Icon name="edit" />
								</button>
								<button
									type="button"
									onclick={() => (confirmingDelete = reminder.id)}
									class="icon-btn icon-btn-danger shrink-0"
									title={t('reminders.removeThisReminder')}
									aria-label={t('reminders.remove', { message: reminder.message })}
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>

						<!--
							The same four questions, opened on the row itself.

							Behind a press rather than always drawn: a list of twenty
							reminders is a list, not twenty forms. What it must not do is
							move anything above it, which is why it grows downward inside
							its own row.
						-->
						<!--
							`reminder.id !== null` first, and it is the whole bug.

							A bill's date and a birthday are rows in this list with no
							reminder behind them yet, so their id is null — and `editing`
							starts as null too. `editing === reminder.id` was therefore
							`null === null` for every one of them, which is true: the page
							opened with an edit form under every derived row it could
							show. Nothing was being edited; they all just looked like it.
						-->
						{#if reminder.id !== null && editing === reminder.id}
							<form
								method="post"
								action="?/edit"
								use:enhance={() => {
									return async ({ result, update }) => {
										await update({ reset: false });
										if (result.type === 'success') {
											editing = null;
											alarmsChanged();
										}
									};
								}}
								class="mt-3 space-y-3 border-t border-gray-200 pt-3"
							>
								<input type="hidden" name="id" value={reminder.id} />
								<FormGrid>
									<Field label={t('reminders.day')} span={6} required>
										<input
											name="day"
											type="date"
											required
											min={data.today}
											autocomplete="off"
											bind:value={editDay}
											onfocus={pick}
											onclick={pick}
											class="input"
										/>
									</Field>
									<Field label={t('reminders.time')} span={6} hint="Empty means {data.dayStart}.">
										<input
											name="time"
											type="time"
											autocomplete="off"
											bind:value={editTime}
											class="input"
										/>
									</Field>
									<Field label={t('reminders.whatToSay')} span={12} required>
										<OneLine name="label" required bind:value={editSay} class="input" />
									</Field>
								</FormGrid>

								{@render alreadyBeen(editDay, editTime)}

								<div class="flex flex-wrap items-center gap-4">
									<label
										class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
										title={t('reminders.whetherThisOneMakesA')}
									>
										{t('reminders.sound')}
										<!--
											Three answers, because a row has three.

											A checkbox can only say yes or no, and the commonest state
											of a nudge before a block is neither: it says nothing and
											does whatever that kind of reminder is set to. Ticking a
											box would quietly turn that into an answer of its own.
										-->
										<select name="sound" bind:value={editSound} class="select w-36">
											<option value="kind">{t('reminders.followTheKind')}</option>
											<option value="on">{t('reminders.makeASound')}</option>
											<option value="off">{t('reminders.silent')}</option>
										</select>
									</label>
									<label
										class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
										title={t('reminders.whichSoundThisOnePlays')}
									>
										{t('reminders.which')}
										<select
											name="ringtoneId"
											bind:value={editTone}
											disabled={editSound !== 'on'}
											class="select w-40"
										>
											<option value="">{t('reminders.default')}</option>
											{#each data.ringtones as tone (tone.id)}
												<option value={String(tone.id)}>{tone.name}</option>
											{/each}
										</select>
									</label>
									<div class="ml-auto flex gap-2">
										<button type="button" onclick={() => (editing = null)} class="btn btn-sm">
											{t('ui.cancel')}
										</button>
										<button
											type="submit"
											disabled={hasBeen(editDay, editTime)}
											class="btn btn-primary btn-sm"
											title={hasBeen(editDay, editTime)
												? t('reminders.thatTimeHasAlreadyBeen2')
												: t('reminders.saveThisReminder')}
										>
											{t('ui.save')}
										</button>
									</div>
								</div>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<!--
		Which kinds are worth hearing.

		Silent unless asked, for every kind: an alarm probably is worth a noise
		and a birthday probably is not, and that is a judgement nobody else can
		make for you.
	-->
	<div data-tour="reminder-sounds">
		<Card
			title={t('reminders.whatMakesASound')}
			description={t('reminders.everythingShowsOnlyTheseAre')}
			flush
		>
			<!--
				A kind, whether it makes a noise, and which noise.

				This was one wrapping row per kind — name, a checkbox, a fixed-width
				select and a Save button — and on a phone it wrapped into a name with
				a checkbox stranded at the far right, then a select and a Save button
				starting from the far left. Four controls on two ragged lines, none
				of them lining up with the row above or below.

				Now it is a grid: the name and its switch on the first line, the
				sound it makes on the second, and every row's columns land in the
				same place. On a wide screen the two lines become one.

				And no Save. The switch and the select each submit themselves, the
				way every other setting in this app does — a row of controls with a
				button you also have to remember to press is a row people leave
				half-set. See `settings/preferences`.
			-->
			<ul class="divide-y divide-gray-200">
				{#each data.sounds as choice (choice.kind)}
					<li class="px-4 py-3">
						<form
							method="post"
							action="?/setSound"
							use:enhance
							class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[1fr_14rem_auto]"
						>
							<input type="hidden" name="kind" value={choice.kind} />

							<span class="flex min-w-0 items-center gap-2 text-sm text-gray-900">
								<span class="shrink-0 text-gray-400">
									<Icon name={kindOf(choice.kind).icon} size={14} />
								</span>
								<span class="truncate">{t(kindOf(choice.kind).label)}</span>
							</span>

							<!--
								The switch sits last on a wide row and first-line-right on a
								phone, which is why it is ordered rather than placed: it is
								the answer to the question the name asks, so it stays beside
								the name at every width.
							-->
							<input
								type="checkbox"
								name="audible"
								value="on"
								class="toggle justify-self-end sm:order-last"
								checked={choice.audible}
								aria-label={t('reminders.sound')}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>

							<select
								name="ringtoneId"
								class="select col-span-2 w-full sm:col-span-1"
								aria-label={t('reminders.whatMakesASound')}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							>
								<option value="" selected={choice.ringtoneId === null}>
									{t('reminders.default')}
								</option>
								{#each data.ringtones as tone (tone.id)}
									<option value={tone.id} selected={choice.ringtoneId === tone.id}
										>{tone.name}</option
									>
								{/each}
							</select>
						</form>
					</li>
				{/each}
			</ul>
		</Card>
	</div>

	<!-- The sounds themselves. -->
	<Card
		title={t('reminders.yourSounds')}
		description={t('reminders.upToRingtonesKbEach', {
			ringtones: data.limits.ringtones,
			kilobytes: data.limits.kilobytes
		})}
		flush
	>
		{#if data.ringtones.length > 0}
			<ul class="divide-y divide-gray-200">
				{#each data.ringtones as tone (tone.id)}
					<li class="flex items-center gap-3 px-4 py-2">
						<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{tone.name}</span>
						<span class="tabular shrink-0 text-xs text-gray-500"
							>{t('reminders.kb', { bytes: Math.round(tone.bytes / 1024) })}</span
						>
						<button
							type="button"
							onclick={() => preview(`/api/ringtones/${tone.id}`)}
							class="icon-btn shrink-0"
							title={t('reminders.hearIt')}
							aria-label={t('reminders.hear', { name: tone.name })}
						>
							<Icon name="play" />
						</button>
						<form method="post" action="?/removeSound" use:enhance class="shrink-0">
							<input type="hidden" name="id" value={tone.id} />
							<button
								type="submit"
								class="icon-btn icon-btn-danger"
								title={t('ui.remove')}
								aria-label={t('reminders.remove2', { name: tone.name })}
								use:armed
							>
								<Icon name="trash" />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="border-t border-gray-200 px-4 py-3">
			<form
				method="post"
				action="?/addSound"
				enctype="multipart/form-data"
				use:enhance
				class="flex flex-wrap items-end gap-3"
			>
				<label class="flex flex-col gap-1 text-sm text-gray-700">
					{t('reminders.aSoundFile')}
					<!-- Choosing the file is the submit: a second button to press after
					     picking one is a step nobody needs. -->
					<!--
						Extensions, not MIME types.

						`accept="audio/mpeg"` tells a phone browser that this field wants
						audio, and a phone browser's answer to that is to offer the
						microphone — Firefox on Android asks for permission to record
						before it will show you a file picker, which is a baffling thing
						to be asked when you are uploading a ringtone. Naming extensions
						asks for a file and nothing else. The server checks the type
						properly either way, so this only decides what the picker offers.
					-->
					<input
						name="sound"
						type="file"
						accept=".mp3,.ogg,.wav"
						required
						class="text-sm"
						onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()}
					/>
				</label>
				<label class="flex flex-col gap-1 text-sm text-gray-700">
					{t('reminders.callIt')}
					<OneLine name="label" placeholder={t('reminders.optional')} class="input" />
				</label>
			</form>
			<p class="mt-2 text-xs text-gray-500">
				{t('reminders.leaveTheNameEmptyAnd')}
			</p>
		</div>
	</Card>
</div>
