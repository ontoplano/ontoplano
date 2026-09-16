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
	const KINDS: Record<string, { label: string; icon: IconName }> = {
		instance: { label: 'Blocks', icon: 'planner' },
		todo: { label: 'Todos', icon: 'check' },
		free: { label: 'Alarms', icon: 'clock' },
		review: { label: 'The weekly review', icon: 'book' },
		bill: { label: 'Bills', icon: 'wallet' },
		person: { label: 'Birthdays', icon: 'cake' }
	};

	const kindOf = (key: string) => KINDS[key] ?? { label: key, icon: 'clock' as IconName };

	/**
	 * The windows worth a button. Anything else goes in the box beside them.
	 *
	 * One and three are here because "what is today" and "what is this weekend"
	 * are the two questions somebody actually opens this page with; a week was
	 * the shortest answer on offer and it is longer than either of them.
	 */
	const WINDOWS = [1, 3, 7, 15, 30, 60];

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
				allowed = await askPhoneToNotify();
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
	const ready = $derived(Boolean(day && say.trim()));

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
		return d.toLocaleString('en-GB', {
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

<svelte:head><title>Reminders · Ontoplano</title></svelte:head>

<audio bind:this={audio} class="hidden"></audio>

<div class="space-y-4">
	<RoomBar title="Reminders" />

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
			Nothing can reach this browser: notifications need HTTPS and this page is on
			<span class="tabular">{origin}</span>. On the machine running it,
			<span class="tabular">localhost</span> counts as secure; from another device it does not.
			<span class="tabular">make https-local</span> serves it over HTTPS with a certificate this machine
			signs — nothing leaves the network, and the phone is told once to trust it. A real certificate on
			a domain you own does the same with nothing to install. Either turns on reminders, installing it
			as an app, and offline, all at once.
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
			Reminders from here ring on this phone, with ontoplano closed — it books Android's own alarms,
			because an instance cannot wake a phone.
			<a href={resolve('/settings/preferences')} class="underline underline-offset-2">Preferences</a
			> stops that, or sets it up again.
		</p>
	{:else if !insecure && (!allowed || unreachable)}
		<Banner kind="warning">
			<div class="flex flex-wrap items-center gap-3">
				<span>
					{#if unreachable}
						This phone is not set up to ring for reminders from here — it can be, in one press on
						Preferences, and then they arrive with ontoplano closed.
					{:else if refused}
						Android has refused notifications and will not ask again, so reminders arrive only while
						ontoplano is open.
					{:else if inPhoneApp()}
						This phone has not been allowed to notify you, so reminders arrive only while ontoplano
						is open.
					{:else}
						This browser has not been allowed to notify you, so reminders arrive only while this
						page is open.
					{/if}
				</span>
				{#if unreachable}
					<!-- The one press that arranges it is on Preferences: this page is
					     on the instance's origin, where the app's own plugins do not
					     reach, and the handshake needs the copy the phone carries. -->
					<a href={resolve('/settings/preferences')} class="btn btn-primary">Set it up</a>
				{:else if refused}
					<button type="button" class="btn btn-primary" onclick={openPhoneNotificationSettings}>
						Open the phone's settings
					</button>
				{:else}
					<button type="button" class="btn btn-primary" onclick={allow} disabled={asking}>
						{asking ? 'Asking…' : 'Allow notifications'}
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
					This browser has no push support, so reminders will only arrive while ontoplano is open.
					Installing it as an app usually fixes that.
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
	<div data-tour="set-alarm">
		<Card title="Set one" description="A day and what to say. It is about nothing else.">
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
						}
					};
				}}
				class="space-y-3"
			>
				<FormGrid>
					<Field label="Day" span={6} required>
						<input
							name="day"
							type="date"
							required
							autocomplete="off"
							bind:value={day}
							onfocus={pick}
							onclick={pick}
							title="Which day it should go off"
							class="input"
						/>
					</Field>
					<Field label="Time" span={6} hint="Empty means {data.dayStart}, when your day starts.">
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
							title="What time it should go off. Empty means {data.dayStart}."
							class="input"
						/>
					</Field>
					<Field label="What to say" span={12} required>
						<OneLine
							name="label"
							required
							bind:value={say}
							placeholder="e.g. take the bread out"
							class="input"
						/>
					</Field>
				</FormGrid>

				<div class="flex flex-wrap items-center gap-4">
					<label
						class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
						title="Play a sound as well as showing it. Off means it only shows."
					>
						<input type="checkbox" name="audible" bind:checked={audible} class="size-4" />
						Make a sound
					</label>
					<label
						class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
						title="Which sound this one plays"
					>
						Sound
						<select name="ringtoneId" class="select w-44">
							<option value="">Default</option>
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
						title={ready ? 'Set this reminder' : 'A day and something to say first'}
					>
						Set it
					</button>
				</div>
			</form>
		</Card>
	</div>

	<!--
		What is coming, and how far ahead you are asking.

		The window is in the address bar rather than in a preference: it is a
		question you ask once — "and what about November?" — not a setting you
		keep, and this way the answer is a link you can send yourself.
	-->
	<Card
		title={data.past ? 'Already been' : 'Coming up'}
		description={data.past
			? `The last ${data.days} ${data.days === 1 ? 'day' : 'days'} — what has already gone off.`
			: `The next ${data.days} ${data.days === 1 ? 'day' : 'days'} — everything set, whatever set it.`}
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
			<div class="seg" role="group" aria-label="Which way to look">
				<button
					type="button"
					onclick={() => look(data.days, false)}
					aria-pressed={!data.past}
					title="What is still to come"
				>
					Ahead
				</button>
				<button
					type="button"
					onclick={() => look(data.days, true)}
					aria-pressed={data.past}
					title="What has already gone off"
				>
					Past
				</button>
			</div>
			<div class="seg" role="group" aria-label="How far">
				{#each WINDOWS as window (window)}
					<button
						type="button"
						onclick={() => look(window)}
						aria-pressed={data.days === window}
						title={data.past ? `The last ${window} days` : `The next ${window} days`}
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
				class="flex items-center gap-2"
			>
				<label class="text-xs whitespace-nowrap text-gray-500" for="how-far">or</label>
				<NumberBox
					id="how-far"
					name="days"
					min="1"
					max={data.maxDays}
					bind:value={howFar}
					autocomplete="off"
					title="How many days to cover, up to {data.maxDays}"
					class="w-20"
				/>
				<span class="text-xs whitespace-nowrap text-gray-500">days</span>
				<button type="submit" class="btn btn-sm" title="Look that far">Go</button>
			</form>
		</div>
		{#if upcoming.length === 0}
			<EmptyState
				icon="clock"
				title={data.past ? 'Nothing went off' : 'Nothing waiting'}
				description={data.past
					? 'Reminders that have already fired show up here, dismissed ones included.'
					: 'Blocks with a reminder, birthdays, bills and anything you set here all show up in this list.'}
			/>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each upcoming as reminder (reminder.key)}
					<li class="px-4 py-2">
						<div class="flex items-center gap-3">
							<span class="shrink-0 text-gray-400" title={kindOf(reminder.subjectKind).label}>
								<Icon name={kindOf(reminder.subjectKind).icon} size={14} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-gray-900">{reminder.message}</span>
								<span class="flex items-center gap-1.5 text-xs text-gray-500">
									{kindOf(reminder.subjectKind).label}
									{#if reminder.shown}· already shown{/if}
									<!-- The one thing about a reminder you want to know before it
								     happens rather than after. -->
									{#if reminder.audible}
										<span class="text-blue-600" title="This one makes a sound">
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
								<form method="post" action="?/remove" use:enhance class="flex shrink-0 gap-1">
									<input type="hidden" name="id" value={reminder.id} />
									<button type="submit" class="btn btn-sm btn-danger" use:armed>Confirm?</button>
									<button
										type="button"
										onclick={() => (confirmingDelete = null)}
										class="btn btn-sm"
									>
										Cancel
									</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => (editing === reminder.id ? (editing = null) : edit(reminder))}
									class="icon-btn shrink-0"
									title="Change this reminder"
									aria-label="Change {reminder.message}"
									aria-expanded={editing === reminder.id}
								>
									<Icon name="edit" />
								</button>
								<button
									type="button"
									onclick={() => (confirmingDelete = reminder.id)}
									class="icon-btn icon-btn-danger shrink-0"
									title="Remove this reminder"
									aria-label="Remove {reminder.message}"
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
						{#if editing === reminder.id}
							<form
								method="post"
								action="?/edit"
								use:enhance={() => {
									return async ({ result, update }) => {
										await update({ reset: false });
										if (result.type === 'success') editing = null;
									};
								}}
								class="mt-3 space-y-3 border-t border-gray-200 pt-3"
							>
								<input type="hidden" name="id" value={reminder.id} />
								<FormGrid>
									<Field label="Day" span={6} required>
										<input
											name="day"
											type="date"
											required
											autocomplete="off"
											bind:value={editDay}
											onfocus={pick}
											onclick={pick}
											class="input"
										/>
									</Field>
									<Field label="Time" span={6} hint="Empty means {data.dayStart}.">
										<input
											name="time"
											type="time"
											autocomplete="off"
											bind:value={editTime}
											class="input"
										/>
									</Field>
									<Field label="What to say" span={12} required>
										<OneLine name="label" required bind:value={editSay} class="input" />
									</Field>
								</FormGrid>

								<div class="flex flex-wrap items-center gap-4">
									<label
										class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
										title="Whether this one makes a noise, whatever its kind does"
									>
										Sound
										<!--
											Three answers, because a row has three.

											A checkbox can only say yes or no, and the commonest state
											of a nudge before a block is neither: it says nothing and
											does whatever that kind of reminder is set to. Ticking a
											box would quietly turn that into an answer of its own.
										-->
										<select name="sound" bind:value={editSound} class="select w-36">
											<option value="kind">Follow the kind</option>
											<option value="on">Make a sound</option>
											<option value="off">Silent</option>
										</select>
									</label>
									<label
										class="flex items-center gap-2 text-sm whitespace-nowrap text-gray-700"
										title="Which sound this one plays"
									>
										Which
										<select
											name="ringtoneId"
											bind:value={editTone}
											disabled={editSound !== 'on'}
											class="select w-40"
										>
											<option value="">Default</option>
											{#each data.ringtones as tone (tone.id)}
												<option value={String(tone.id)}>{tone.name}</option>
											{/each}
										</select>
									</label>
									<div class="ml-auto flex gap-2">
										<button type="button" onclick={() => (editing = null)} class="btn btn-sm">
											Cancel
										</button>
										<button type="submit" class="btn btn-primary btn-sm">Save</button>
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
		<Card title="What makes a sound" description="Everything shows. Only these are heard." flush>
			<ul class="divide-y divide-gray-200">
				{#each data.sounds as choice (choice.kind)}
					<li class="px-4 py-2">
						<form
							method="post"
							action="?/setSound"
							use:enhance
							class="flex flex-wrap items-center gap-3"
						>
							<input type="hidden" name="kind" value={choice.kind} />
							<span class="flex min-w-32 flex-1 items-center gap-2 text-sm text-gray-900">
								<span class="shrink-0 text-gray-400">
									<Icon name={kindOf(choice.kind).icon} size={14} />
								</span>
								{kindOf(choice.kind).label}
							</span>
							<label class="flex items-center gap-2 text-sm text-gray-700">
								<input type="checkbox" name="audible" checked={choice.audible} class="size-4" />
								Sound
							</label>
							<select name="ringtoneId" class="select w-56 shrink-0">
								<option value="" selected={choice.ringtoneId === null}> Default </option>
								{#each data.ringtones as tone (tone.id)}
									<option value={tone.id} selected={choice.ringtoneId === tone.id}
										>{tone.name}</option
									>
								{/each}
							</select>
							<button type="submit" class="btn btn-sm" title="Save what this kind sounds like">
								Save
							</button>
						</form>
					</li>
				{/each}
			</ul>
		</Card>
	</div>

	<!-- The sounds themselves. -->
	<Card
		title="Your sounds"
		description="Up to {data.limits.ringtones}, {data.limits.kilobytes} KB each. MP3, OGG or WAV."
		flush
	>
		{#if data.ringtones.length > 0}
			<ul class="divide-y divide-gray-200">
				{#each data.ringtones as tone (tone.id)}
					<li class="flex items-center gap-3 px-4 py-2">
						<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{tone.name}</span>
						<span class="tabular shrink-0 text-xs text-gray-500">
							{Math.round(tone.bytes / 1024)} KB
						</span>
						<button
							type="button"
							onclick={() => preview(`/api/ringtones/${tone.id}`)}
							class="icon-btn shrink-0"
							title="Hear it"
							aria-label="Hear {tone.name}"
						>
							<Icon name="play" />
						</button>
						<form method="post" action="?/removeSound" use:enhance class="shrink-0">
							<input type="hidden" name="id" value={tone.id} />
							<button
								type="submit"
								class="icon-btn icon-btn-danger"
								title="Remove"
								aria-label="Remove {tone.name}"
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
					A sound file
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
					Call it
					<OneLine name="label" placeholder="optional" class="input" />
				</label>
			</form>
			<p class="mt-2 text-xs text-gray-500">
				Leave the name empty and the file's own name is used.
			</p>
		</div>
	</Card>
</div>
