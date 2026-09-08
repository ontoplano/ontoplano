<script lang="ts">
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import TimeDial from '$lib/components/TimeDial.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import OneLine from '$lib/components/OneLine.svelte';
	import { armed } from '$lib/actions/armed';
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

	/** The alarm being written, so the button can know whether it is ready. */
	let day = $state('');
	let time = $state('');
	let say = $state('');
	let audible = $state(false);
	const ready = $derived(Boolean(day && time && say.trim()));

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
	function look(days: number) {
		const wanted = Math.max(1, Math.min(data.maxDays, Math.trunc(days) || data.days));
		howFar = wanted;
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/reminders')}?days=${wanted}`, {
			noScroll: true,
			keepFocus: true,
			replaceState: true
		});
	}

	onMount(() => {
		insecure = !window.isSecureContext;
		origin = `${location.protocol}//${location.host}`;
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
	};

	const upcoming = $derived<Listed[]>(
		[
			...data.reminders
				.filter((r) => !r.dismissedAt)
				.map((r) => ({
					key: `set:${r.id}`,
					id: r.id,
					message: r.message,
					remindAt: r.remindAt,
					subjectKind: r.subjectKind,
					shown: Boolean(r.deliveredAt),
					audible: r.audible
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
				audible: data.sounds.find((c) => c.kind === u.kind)?.audible ?? false
			}))
		].sort((a, b) => a.remindAt.localeCompare(b.remindAt))
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
	<h1 class="text-lg font-bold text-gray-900">Reminders</h1>

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
		The alarm clock.

		A reminder about nothing: a time and a sentence. It shows wherever
		notifications are on; it only makes a noise if you say so here, because a
		thing that beeps without being asked is a thing whose sound gets turned
		off for good.
	-->
	<div data-tour="set-alarm">
		<Card title="Set one" description="A time and what to say. It is about nothing else.">
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
					<Field label="Time" span={6} required>
						<!--
							A clock, not four digits.

							`showPicker()` opens the platform's own, and which mode that
							opens in — the dial or a numeric keypad — is Android's choice,
							remembered from whatever was used last. No web API asks for the
							dial, so a field that is always the dial has to be one.
						-->
						<TimeDial name="time" required bind:value={time} />
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
						title={ready ? 'Set this reminder' : 'A day, a time and something to say first'}
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
		title="Coming up"
		description="The next {data.days} {data.days === 1
			? 'day'
			: 'days'} — everything set, whatever set it."
		flush
	>
		<div
			class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2"
			data-tour="reminder-window"
		>
			<div class="seg" role="group" aria-label="How far ahead">
				{#each WINDOWS as window (window)}
					<button
						type="button"
						onclick={() => look(window)}
						aria-pressed={data.days === window}
						title="The next {window} days"
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
				<input
					id="how-far"
					name="days"
					type="number"
					min="1"
					max={data.maxDays}
					bind:value={howFar}
					autocomplete="off"
					title="How many days ahead to look, up to {data.maxDays}"
					class="input tabular w-20 py-1 text-sm"
				/>
				<span class="text-xs whitespace-nowrap text-gray-500">days</span>
				<button type="submit" class="btn btn-sm" title="Look that far ahead">Go</button>
			</form>
		</div>
		{#if upcoming.length === 0}
			<EmptyState
				icon="clock"
				title="Nothing waiting"
				description="Blocks with a reminder, birthdays, bills and anything you set here all show up in this list."
			/>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each upcoming as reminder (reminder.key)}
					<li class="flex items-center gap-3 px-4 py-2">
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
							<!-- Nothing to remove: it is not a row, it is a date in the
							     address book or on a bill. -->
							<span class="w-7 shrink-0"></span>
						{:else if confirmingDelete === reminder.id}
							<form method="post" action="?/remove" use:enhance class="flex shrink-0 gap-1">
								<input type="hidden" name="id" value={reminder.id} />
								<button type="submit" class="btn btn-sm btn-danger" use:armed>Confirm?</button>
								<button type="button" onclick={() => (confirmingDelete = null)} class="btn btn-sm">
									Cancel
								</button>
							</form>
						{:else}
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
