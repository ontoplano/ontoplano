<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { isIsolatedBuild } from '$lib/isolated/mode';
	import { isLocale, useT } from '$lib/i18n';
	import { rememberLocaleOnThisDevice } from '$lib/i18n/device';
	import OneLine from '$lib/components/OneLine.svelte';
	import { page } from '$app/state';
	import { disablePush, enablePush, pushEnabled, pushSupported } from '$lib/push';
	import { inPhoneApp } from '$lib/instance-choice';
	import { DEVICE_ORIGIN } from '$lib/instance-choice';
	import {
		askPhoneToNotify,
		openPhoneNotificationSettings,
		phonePermission,
		testPhoneNotification
	} from '$lib/phone-notifications';
	import { settingsForm } from '$lib/actions/settings-form';
	import { resolve } from '$app/paths';
	import { isCurrency } from '$lib/money';
	import TimezonePicker from '$lib/components/TimezonePicker.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData } from './$types';
	import { THEMES } from '$lib/theme.js';
	import type { DashboardCardId } from '$lib/dashboard.js';

	let { data }: { data: PageServerData } = $props();

	const t = useT();

	/**
	 * The currency, chosen from the shortlist or typed.
	 *
	 * `currency` is what the form posts, so the two controls have one answer
	 * between them and the server sees one field either way. The preview is the
	 * honest check: if the browser can print a price in it, the app can.
	 */
	const OTHER = '__other__';
	const shortlist: readonly string[] = data.currencies;

	let currencyChoice = $state(shortlist.includes(data.currency) ? data.currency : OTHER);
	let otherCurrency = $state(shortlist.includes(data.currency) ? '' : data.currency);

	const currency = $derived(
		currencyChoice === OTHER ? otherCurrency.trim().toUpperCase() : currencyChoice
	);

	/**
	 * What the code means, if it means anything.
	 *
	 * `Intl.NumberFormat` is not the check — it formats *any* three letters,
	 * printing the code where the symbol goes, so `ZZZ` looked fine. `isCurrency`
	 * asks the platform's ISO 4217 list. The name beside the price is what
	 * actually confirms it: "zł 12,50" could be a typo, "Polish Zloty" could not.
	 */
	const preview = $derived.by(() => {
		if (!isCurrency(currency)) return null;
		let name = '';
		try {
			name = new Intl.DisplayNames(undefined, { type: 'currency' }).of(currency) ?? '';
		} catch {
			/* a runtime without display names still gets the price */
		}
		return {
			price: new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(12.5),
			name: name && name.toUpperCase() !== currency ? name : ''
		};
	});

	// Local copy so a card can be toggled and reordered before saving.
	let layout: DashboardCardId[] = $state([...data.layout]);
	$effect(() => {
		layout = [...data.layout];
	});

	function isOn(id: DashboardCardId): boolean {
		return layout.includes(id);
	}

	function toggle(id: DashboardCardId) {
		layout = isOn(id) ? layout.filter((x) => x !== id) : [...layout, id];
	}

	/*
	 * The rooms, in the order this account keeps them.
	 *
	 * A local copy so the arrows and the Hide buttons can move things before
	 * anything is saved, reset from the server whenever the load re-runs — the
	 * same shape the dashboard layout below uses, for the same reason.
	 */
	let rooms = $state([...data.rooms]);
	$effect(() => {
		rooms = [...data.rooms];
	});

	/**
	 * Shown first in their order, then the ones put away.
	 *
	 * A room with no place in the menu has no place in the order either, so it
	 * falls to the bottom and loses its number — which is also what the saved
	 * order says, since the form posts this list.
	 */
	const orderedRooms = $derived([
		...rooms.filter((r) => !r.hidden),
		...rooms.filter((r) => r.hidden)
	]);

	/** The last row that can still move down: the ones below it are put away. */
	const lastShownIndex = $derived(rooms.filter((r) => !r.hidden).length - 1);

	function shiftRoom(key: string, by: number) {
		const shown = rooms.filter((r) => !r.hidden);
		const at = shown.findIndex((r) => r.key === key);
		const to = at + by;
		if (at === -1 || to < 0 || to >= shown.length) return;
		[shown[at], shown[to]] = [shown[to], shown[at]];
		rooms = [...shown, ...rooms.filter((r) => r.hidden)];
	}

	/** Put one tab away, or bring it back — the room stays where it is. */
	function toggleLeaf(id: string) {
		rooms = rooms.map((r) => ({
			...r,
			leaves: r.leaves.map((l) => (l.id === id ? { ...l, hidden: !l.hidden } : l))
		}));
	}

	function toggleRoom(key: string) {
		rooms = rooms.map((r) => (r.key === key ? { ...r, hidden: !r.hidden } : r));
	}

	function shift(id: DashboardCardId, by: number) {
		const at = layout.indexOf(id);
		const to = at + by;
		if (at === -1 || to < 0 || to >= layout.length) return;
		const next = [...layout];
		[next[at], next[to]] = [next[to], next[at]];
		layout = next;
	}

	const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	/** 24-hour, like every other time in the app; 24 is the end of the day. */
	function hourLabel(h: number): string {
		return `${String(h).padStart(2, '0')}:00`;
	}

	// Removing a quote is destructive, so it takes two clicks like every other
	// delete in the app.
	let confirmRemove = $state<number | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') confirmRemove = null;
	}

	/*
	 * Whether this browser is signed up, asked of the browser itself.
	 *
	 * The server's row can outlive a subscription the browser quietly dropped —
	 * cleared site data, a rotated endpoint — and the question on this page is
	 * "will this device be told", which only the device can answer.
	 */
	/*
	 * `unsupported` is a browser with no push; `unreachable` is the app looking
	 * at somebody else's instance, where the shell's plugins do not reach. They
	 * are different sentences because they are different situations, and the
	 * second one used to be drawn as a refusal by Android.
	 */
	let notifications = $state<'off' | 'on' | 'denied' | 'unsupported' | 'unreachable'>('off');

	/*
	 * Inside the phone app the question is Android's, not the browser's.
	 *
	 * The web view has no Push API, so asking it says "unsupported" — about an
	 * app whose reminders arrive through Android's own alarms. In the app this
	 * section talks to that instead: permission checked with the notifications
	 * plugin, asked for with it, and tested by booking one a few seconds out.
	 * `$state` set in an effect rather than read at init, so the server render
	 * and the first client render agree.
	 */
	let inApp = $state(false);

	$effect(() => {
		if (inPhoneApp()) {
			inApp = true;
			/*
			 * Three states, not two.
			 *
			 * This asked "will it notify?" and drew a Turn on button for anything
			 * that was not yes — including a phone that has already refused twice,
			 * where Android never shows the dialog again and the button therefore
			 * did nothing at all. A refusal is its own state, and its answer is the
			 * settings screen rather than another ask.
			 */
			void phonePermission().then((answer) => {
				notifications =
					answer === 'granted'
						? 'on'
						: answer === 'denied'
							? 'denied'
							: answer === 'unreachable'
								? 'unreachable'
								: 'off';
			});
			return;
		}
		if (!pushSupported()) {
			notifications = 'unsupported';
			return;
		}
		if (Notification.permission === 'denied') {
			notifications = 'denied';
			return;
		}
		void pushEnabled().then((on) => (notifications = on ? 'on' : 'off'));
	});

	async function turnOnPhone() {
		notifications = (await askPhoneToNotify()) ? 'on' : 'denied';
	}

	/** Whether the phone's own settings screen opened, so a dead button says so. */
	let settingsFailed = $state(false);

	/** Whether the phone is being set up to ring for this instance. */
	let ringing = $state<'no' | 'asking' | 'failed'>('no');
	async function openPhoneSettings() {
		settingsFailed = !(await openPhoneNotificationSettings());
	}

	/** Book a notification a few seconds out, and say so. */
	let phoneTested = $state('');
	async function sendPhoneTest() {
		phoneTested = (await testPhoneNotification())
			? 'Booked — it arrives in a few seconds, lock the phone if you want to see it land outside.'
			: 'Android would not take it. Check the app is allowed notifications in the phone settings.';
	}

	async function turnOn() {
		const result = await enablePush(page.data.pushKey ?? null);
		notifications = result === 'failed' ? 'off' : result;
	}

	/** What a test push is doing, and what it answered. */
	let testing = $state(false);
	let tested = $state('');

	async function sendTest() {
		testing = true;
		tested = '';
		try {
			const response = await fetch('/api/push/test', { method: 'POST' });
			const body = (await response.json()) as {
				ok: boolean;
				sent?: number;
				devices?: number;
				why?: string | null;
			};
			/*
			 * The reason, not the arithmetic.
			 *
			 * "Sent to 1 of 2 devices" says something is wrong and nothing about
			 * what — and its obvious reading, "the phone was not seen", is the one
			 * thing it does not mean. The server names each device that refused
			 * and why; if any did, that is the sentence worth showing.
			 */
			tested = body.why
				? body.why
				: `Sent to ${body.sent} device${body.sent === 1 ? '' : 's'}. If nothing appeared, the browser is holding it back.`;
		} catch {
			tested = 'The request did not reach the server.';
		} finally {
			testing = false;
		}
	}

	async function turnOff() {
		await disablePush();
		notifications = 'off';
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<form
		method="post"
		action="?/saveWeek"
		use:settingsForm={{ notice: 'Week saved.' }}
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Week and timezone</h2>
		</div>
		<div class="flex gap-4">
			<label class="flex-1">
				<span class="eyebrow text-gray-600">First day of week</span>
				<select
					name="firstDay"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				>
					{#each dayNames as day, i (i)}
						<option value={i} selected={data.week.firstDay === i}>{day}</option>
					{/each}
				</select>
			</label>
			<label class="flex-1">
				<span class="eyebrow text-gray-600">Generate tasks on</span>
				<select
					name="generateDay"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				>
					{#each dayNames as day, i (i)}
						<option value={i} selected={data.week.generateDay === i}>{day}</option>
					{/each}
				</select>
			</label>
		</div>
		<label class="block max-w-xs">
			<span class="eyebrow text-gray-600">Timezone</span>
			<TimezonePicker groups={data.zones} value={data.timezone} />
		</label>
		<button class="btn btn-primary">Save</button>
	</form>

	<!-- One currency per account: a shopping list in three is a spreadsheet. -->
	<form
		method="post"
		action="?/saveCurrency"
		use:settingsForm={{ notice: 'Currency saved.' }}
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Money</h2>
			<p class="mt-1 text-sm text-gray-500">What prices on the shopping list are in.</p>
		</div>
		<!--
			Eight in a list, and a field for the rest.

			The eight cover most people in one click; they were also the whole of
			what the app would take, so somebody paid in zloty or rand could not
			record what they spend. Anything ISO 4217 is accepted now, and the
			check is whether the browser will print it — which is the boundary
			that actually matters, since a code it cannot format throws on every
			price on the page.
		-->
		<div class="flex flex-wrap items-end gap-3">
			<label class="block w-[12rem]">
				<span class="eyebrow text-gray-600">Currency</span>
				<select bind:value={currencyChoice} aria-label="Currency" class="select mt-1">
					{#each data.currencies as code (code)}
						<option value={code}>{code}</option>
					{/each}
					<option value={OTHER}>Another…</option>
				</select>
			</label>

			{#if currencyChoice === OTHER}
				<label class="block max-w-[9rem]">
					<span class="eyebrow text-gray-600">Its code</span>
					<input
						bind:value={otherCurrency}
						maxlength="3"
						autocomplete="off"
						spellcheck="false"
						placeholder="PLN"
						aria-label="Currency code"
						class="input mt-1 uppercase"
					/>
				</label>
			{/if}

			<!-- One field reaches the server, whichever way it was answered. -->
			<input type="hidden" name="currency" value={currency} />
		</div>

		{#if currencyChoice === OTHER}
			<p class="text-sm text-gray-500">
				{#if preview}
					Prices will read <span class="font-medium text-gray-900">{preview.price}</span
					>{#if preview.name}&nbsp;— {preview.name}{/if}.
				{:else if otherCurrency.trim().length === 3}
					<span class="text-red-700"
						>{otherCurrency.trim().toUpperCase()} is not a currency code this browser knows.</span
					>
				{:else}
					Three letters — the ISO code, like PLN or ZAR.
				{/if}
			</p>
		{/if}

		<button class="btn btn-primary" disabled={currencyChoice === OTHER && !preview}>Save</button>
	</form>

	<!--
		The hours the planner draws.

		Six to midnight is a reasonable default and a poor law: a baker's day
		starts at four and a night shift ends after it.
	-->
	<form
		method="post"
		action="?/saveGridHours"
		use:settingsForm={{ notice: 'Planner hours saved.' }}
		class="space-y-4 border border-gray-200 bg-white p-6 shadow-card"
	>
		<div>
			<h2 class="text-sm font-semibold text-gray-900">Planner hours</h2>
			<p class="mt-1 text-sm text-gray-500">
				The stretch of the day the day and week grids show. Anything outside it is still there — it
				just is not drawn.
			</p>
		</div>
		<div class="flex gap-4">
			<label class="flex-1 sm:max-w-[10rem]">
				<span class="eyebrow text-gray-600">Day starts at</span>
				<select name="start" class="select mt-1">
					{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
						<option value={h} selected={data.gridHours.start === h}>{hourLabel(h)}</option>
					{/each}
				</select>
			</label>
			<label class="flex-1 sm:max-w-[10rem]">
				<span class="eyebrow text-gray-600">Day ends at</span>
				<select name="end" class="select mt-1">
					{#each Array.from({ length: 24 }, (_, h) => h + 1) as h (h)}
						<option value={h} selected={data.gridHours.end === h}>{hourLabel(h)}</option>
					{/each}
				</select>
			</label>
		</div>
		<button class="btn btn-primary">Save</button>
	</form>

	<!--
		What the app will interrupt you for — an account's answer, not a device's.

		The section under this one is about permission, which belongs to the
		browser on the machine it was given on. This is the other half and the
		one nobody could answer before: each of these decided for itself whether
		to happen — the review nag always did, bills always did, the Monday mail
		was a checkbox on a different page, and a block could only say anything
		if you gave that block a lead time by hand.

		Drawn from the list in `services/notifications.ts` rather than written
		out row by row, so a notification the app gains appears here by existing.
		Each row saves itself: a section-wide Save button over six independent
		switches is a button somebody presses hoping it kept all of them.
	-->
	<section class="space-y-4 border border-gray-200 bg-white p-6 shadow-card">
		<div>
			<h2 class="text-sm font-semibold text-gray-900">What you are told about</h2>
			<p class="mt-1 text-sm text-gray-500">
				Everything the app will say without being asked. Whether each one makes a sound is a
				separate question, on
				<a href={resolve('/reminders')} class="underline underline-offset-2">Reminders</a>.
			</p>
		</div>

		<ul class="divide-y divide-gray-200 border-t border-gray-200">
			{#each data.notifications as what (what.id)}
				<!--
					Stacked on a phone, side by side where there is room.

					`flex-wrap` alone put the controls beside the sentence and let
					the sentence wrap around them, which on a narrow screen gave
					"The end of the day" three lines of title and five of
					description in a column an inch wide. The row is a column until
					there is width for two things on a line.
				-->
				<li class="flex flex-col items-stretch gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-gray-900">{what.label}</p>
						<p class="mt-0.5 text-sm leading-relaxed text-gray-500">{what.description}</p>
					</div>

					<!--
						A wall, said rather than hidden.

						An instance that runs on the phone itself books Android's alarms,
						so every one of these arrives with the app shut — except the
						Monday mail, which goes out from a machine that has to be running
						on a Monday morning. A switch for that is not a setting, it is a
						promise. Said the way every other wall in the app is said, with
						both ways round it: see `capabilities.ts`.
					-->
					{#if what.whyNot}
						<p class="shrink-0 text-sm text-gray-500 sm:max-w-xs">{what.whyNot}</p>
					{:else}
						<form
							method="post"
							action="?/setNotification"
							use:settingsForm={{ notice: 'Saved.' }}
							class="flex shrink-0 items-center gap-2"
						>
							<input type="hidden" name="id" value={what.id} />
							<!--
							The hour comes with the switch, so turning it on and choosing
							when are one act. Submitted on change rather than behind a
							button of its own: a time field with a Save beside it is two
							controls for one answer.
						-->
							{#if what.at !== null}
								<label class="flex items-center gap-2 text-sm text-gray-700">
									<span class="sr-only">When</span>
									<input
										type="time"
										name="at"
										value={what.at}
										autocomplete="off"
										class="input w-32"
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									/>
								</label>
							{/if}
							{#each [['on', 'On'], ['off', 'Off']] as [value, label] (value)}
								<button
									type="submit"
									name="on"
									{value}
									class="border px-3 py-1.5 text-sm shadow-sm {(what.on ? 'on' : 'off') === value
										? 'border-gray-900 bg-gray-900 font-semibold text-white'
										: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
								>
									{label}
								</button>
							{/each}
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<!--
		Notifications, which are per device and cannot be otherwise.

		Permission belongs to the browser on the machine it was given on, so this
		is not a setting stored against the account: the phone and the laptop
		answer separately, and a switch that claimed to speak for both would be
		lying on one of them. Absent entirely on an instance with no keys, rather
		than shown and broken.
	-->
	{#if page.data.pushKey || inApp}
		<section class="space-y-4 border border-gray-200 bg-white p-6 shadow-card">
			<div>
				<h2 class="text-sm font-semibold text-gray-900">Notifications on this device</h2>
				<!--
					One sentence. It said the same thing three times — a headline, a
					paragraph restating it with the mechanism, and a third about how
					often the phone asks — to somebody who wanted to know whether their
					reminders ring and which button turns that off.
				-->
				<p class="mt-1 text-sm text-gray-500">
					{#if inApp && notifications === 'unreachable' && data.ringsOnAPhone}
						Reminders from <strong class="text-gray-700">{page.url.host}</strong> ring here with the app
						closed.
					{:else if inApp && notifications === 'unreachable'}
						Reminders from <strong class="text-gray-700">{page.url.host}</strong> can ring here with the
						app closed. Not set up yet.
					{:else if inApp}
						Reminders arrive with the app closed, through Android's own alarms.
					{:else}
						Reminders arrive with the app closed. Asked for once per browser.
					{/if}
				</p>
			</div>

			{#if inApp}
				{#if notifications === 'unreachable'}
					<!--
						The app, showing an instance that is not the copy it carries.

						The shell's plugins reach its own origin and no further, so this
						page — served by a server — cannot ask Android anything, book an
						alarm, or open a settings screen. Saying so is the whole of what
						can be done here: it said "Android said no" instead, to somebody
						whose phone says Allowed, and offered a button that opened
						nothing.
					-->
					<!--
						Set up at launch, not by pressing this.

						The app asks for a key the first time it opens an instance it has
						none for, and stores it in the shell — see `ringer-handshake.ts`.
						Nobody should have to arrange to be reminded by their own ontoplano
						on their own phone. What is left here is the two things somebody
						might actually want: to stop, and to try again when it has not
						worked.
					-->
					<div class="mt-3 flex flex-wrap items-center gap-3">
						{#if data.ringsOnAPhone}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- another origin -->
							<a
								href="{DEVICE_ORIGIN}/ring?off=1&at={encodeURIComponent(page.url.origin)}"
								class="btn btn-sm">Stop ringing on this phone</a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
						<form
							method="post"
							action="/settings/integrations?/ringOnThisPhone"
							use:enhance={() => {
								ringing = 'asking';
								return async ({ result }) => {
									const key =
										result.type === 'success' ? (result.data as { key?: string })?.key : undefined;
									if (!key) {
										ringing = 'failed';
										return;
									}
									location.href = `${DEVICE_ORIGIN}/ring?at=${encodeURIComponent(
										page.url.origin
									)}&key=${encodeURIComponent(key)}`;
								};
							}}
						>
							<button
								class="btn btn-sm {data.ringsOnAPhone ? 'btn-quiet' : 'btn-primary'}"
								disabled={ringing === 'asking'}
							>
								{ringing === 'asking'
									? 'Setting it up…'
									: data.ringsOnAPhone
										? 'Set it up again'
										: 'Ring on this phone'}
							</button>
						</form>
					</div>
					{#if ringing === 'failed'}
						<p class="mt-2 text-sm text-gray-600">
							This instance would not make a key. Try again, or make one under AI & Integrations.
						</p>
					{/if}
				{:else if notifications === 'on'}
					<div class="flex flex-wrap items-center gap-3">
						<span class="text-sm text-gray-700">On for this phone.</span>
						<button class="btn btn-sm" onclick={sendPhoneTest}>Send a test</button>
					</div>
					{#if phoneTested}
						<p class="mt-2 text-sm text-gray-600">{phoneTested}</p>
					{/if}
				{:else if notifications === 'denied'}
					<!--
						A refusal Android will not revisit, and the door out of it.

						After two noes the permission dialog never appears again, so the
						only way back is the system's own screen — and this said so in
						prose, which leaves somebody who wants reminders following
						directions instead of pressing a button.
					-->
					<div class="flex flex-wrap items-center gap-3">
						<span class="text-sm text-gray-700"> Android said no, and will not ask again. </span>
						<button class="btn btn-primary btn-sm" onclick={openPhoneSettings}>
							Open the phone's settings
						</button>
					</div>
					{#if settingsFailed}
						<p class="mt-2 text-sm text-gray-600">
							This phone would not open it. Settings → Apps → Ontoplano → Notifications.
						</p>
					{/if}
				{:else}
					<button class="btn btn-primary" onclick={turnOnPhone}>Turn on</button>
				{/if}
			{:else if notifications === 'unsupported'}
				<p class="text-sm text-gray-500">This browser cannot do it.</p>
			{:else if notifications === 'denied'}
				<p class="text-sm text-gray-500">
					Blocked for this site. Its permission has to be changed in the browser.
				</p>
			{:else if notifications === 'on'}
				<div class="flex flex-wrap items-center gap-3">
					<span class="text-sm text-gray-700">On for this device.</span>
					<!--
						Six links between "allow" and a phone buzzing, and when nothing
						arrives every one of them is a candidate. This walks the whole
						chain for real — the same code a reminder takes — and says which
						link broke, instead of leaving somebody to set a reminder and
						wait a minute to find out.
					-->
					<button class="btn btn-sm" onclick={sendTest} disabled={testing}>
						{testing ? 'Sending…' : 'Send a test'}
					</button>
					<button class="btn btn-sm" onclick={turnOff}>Turn off</button>
				</div>
				{#if tested}
					<p class="mt-2 text-sm text-gray-600">{tested}</p>
				{/if}
			{:else}
				<button class="btn btn-primary" onclick={turnOn}>Turn on</button>
			{/if}
		</section>
	{/if}

	<!--
		The rooms: one list, three answers.

		This was three sections — Sections, The menu, Colours — listing the same
		eight things and asking one question of each, so changing where Diary
		sits and what colour it is meant scrolling between two lists that looked
		identical. One row per room, holding its order, whether it is shown, and
		its colour.

		Home is not here, because Home is not a room: the wordmark in the header
		and the house in the phone bar are the way back. A row whose every
		control is disabled teaches you that the controls do not work.
	-->
	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">The menu</h2>
			<p class="mt-1 text-sm text-gray-500">
				The rooms, in the order they appear — along the bar, and round the wheel. First in the list
				is first along the bar and first under your thumb: the wheel starts at the bottom right and
				goes anti-clockwise.
				<a
					href="https://docs.ontoplano.com/the-wheel"
					class="font-medium text-gray-900 underline"
					rel="external">How the wheel is laid out</a
				>. A room you put away leaves every menu and keeps everything in it — its pages still open
				from a link.
			</p>
		</div>

		<form
			method="post"
			action="?/saveMenu"
			data-tour="prefs-menu"
			use:settingsForm={{ notice: 'Menu saved.' }}
			class="space-y-2"
		>
			{#each orderedRooms as room, i (room.key)}
				{@const shown = !room.hidden}
				<div
					class="flex items-center gap-3 border px-3 py-2 {shown
						? 'border-gray-200'
						: 'border-dashed border-gray-300 bg-gray-50'}"
				>
					<input type="hidden" name="room" value={room.key} />
					{#if room.hidden && room.hide}
						<input type="hidden" name="hidden" value={room.hide} />
					{/if}

					<!-- A number only where there is a position. A room that is put
					     away has no place in the order, so it has no number. -->
					<span class="tabular w-5 shrink-0 text-xs text-gray-500">
						{shown ? i + 1 : ''}
					</span>

					{#if room.ownsColor}
						<input
							type="color"
							name="color.{room.section}"
							value={room.accent}
							class="h-6 w-8 shrink-0 cursor-pointer border border-gray-300 bg-white p-0.5"
							aria-label="The colour for {room.label}"
						/>
					{:else}
						<!-- Shown, not editable: this room wears another's colour, and
						     three pickers for one value is three ways to disagree. -->
						<span
							class="h-6 w-8 shrink-0 border border-gray-200"
							style="background-color: {room.accent}"
							title="Follows {room.colorFrom}"
						></span>
					{/if}

					<span class="min-w-0 flex-1 truncate text-sm {shown ? 'text-gray-900' : 'text-gray-500'}">
						{room.label}
						{#if !room.ownsColor}
							<span class="text-xs text-gray-500">· {room.colorFrom}'s colour</span>
						{/if}
					</span>

					{#if shown}
						<button
							type="button"
							onclick={() => shiftRoom(room.key, -1)}
							disabled={i === 0}
							class="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
							title="Move up"
							aria-label="Move {room.label} up"
						>
							<Icon name="chevron-up" size={16} />
						</button>
						<button
							type="button"
							onclick={() => shiftRoom(room.key, 1)}
							disabled={i === lastShownIndex}
							class="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
							title="Move down"
							aria-label="Move {room.label} down"
						>
							<Icon name="chevron-down" size={16} />
						</button>
					{/if}

					{#if room.hide}
						<button
							type="button"
							onclick={() => toggleRoom(room.key)}
							class="btn btn-sm shrink-0"
							aria-pressed={room.hidden}
						>
							{room.hidden ? 'Show' : 'Hide'}
						</button>
					{:else}
						<span class="eyebrow shrink-0 text-gray-500">always on</span>
					{/if}
				</div>

				<!--
					The tabs inside the room, one line each.
					
					Indented under it rather than listed beside it: they are not
					rooms, and putting Recipes away should leave Workouts where
					it is. A room that is itself put away says so once and does
					not offer the choice twice.
				-->
				{#each room.leaves as leaf (leaf.id)}
					<div
						class="ml-8 flex items-center gap-3 border border-l-2 border-gray-200 border-l-gray-300 px-3 py-1.5 text-sm"
					>
						{#if leaf.hidden || room.hidden}
							<input type="hidden" name="hidden" value={leaf.id} />
						{/if}
						<span class="min-w-0 flex-1 truncate {room.hidden ? 'text-gray-400' : 'text-gray-700'}"
							>{leaf.label}</span
						>
						{#if room.hidden}
							<span class="eyebrow shrink-0 text-gray-400">with the room</span>
						{:else}
							<button
								type="button"
								onclick={() => toggleLeaf(leaf.id)}
								class="btn btn-sm shrink-0"
								aria-pressed={leaf.hidden}
							>
								{leaf.hidden ? 'Show' : 'Hide'}
							</button>
						{/if}
					</div>
				{/each}
			{/each}

			<div class="flex flex-wrap items-center gap-2 pt-2">
				<button class="btn btn-primary">Save menu</button>
				{#if !data.menuIsDefault}
					<button formaction="?/resetMenu" class="btn btn-sm">Back to the defaults</button>
				{/if}
			</div>
			<p class="text-xs text-gray-500">
				Pick dark colours: the labels on the wheel are white. The planner is always on.
			</p>
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Dashboard</h2>
			<p class="mt-1 text-sm text-gray-500">Which cards appear, and in what order.</p>
		</div>

		<form
			method="post"
			action="?/setLayout"
			use:settingsForm={{ notice: 'Dashboard layout saved.' }}
			class="space-y-2"
		>
			{#each layout as id (id)}
				{@const card = data.cards.find((c) => c.id === id)}
				{#if card}
					<div class="flex items-center gap-3 border border-gray-200 px-3 py-2">
						<input type="hidden" name="card" value={id} />
						<div class="flex flex-col">
							<button
								type="button"
								onclick={() => shift(id, -1)}
								class="text-xs leading-none text-gray-500 hover:text-gray-900"
								aria-label="Move {card.label} up">&uarr;</button
							>
							<button
								type="button"
								onclick={() => shift(id, 1)}
								class="text-xs leading-none text-gray-500 hover:text-gray-900"
								aria-label="Move {card.label} down">&darr;</button
							>
						</div>
						<div class="min-w-0 flex-1">
							<span class="text-sm font-medium text-gray-900">{card.label}</span>
							<p class="text-xs text-gray-500">{card.description}</p>
						</div>
						<button type="button" onclick={() => toggle(id)} class="btn btn-sm">Hide</button>
					</div>
				{/if}
			{/each}

			{#each data.cards.filter((c) => !isOn(c.id)) as card (card.id)}
				<div
					class="flex items-center gap-3 border border-dashed border-gray-300 px-3 py-2 opacity-60"
				>
					<div class="min-w-0 flex-1">
						<span class="text-sm font-medium text-gray-900">{card.label}</span>
						<p class="text-xs text-gray-500">{card.description}</p>
					</div>
					<button type="button" onclick={() => toggle(card.id)} class="btn btn-sm">Show</button>
				</div>
			{/each}

			<div class="flex gap-2 pt-1">
				<button class="btn btn-primary">Save layout</button>
				<button formaction="?/resetLayout" class="btn">Reset to defaults</button>
			</div>
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Quotes</h2>
			<p class="mt-1 text-sm text-gray-500">One is shown per day on the dashboard.</p>
		</div>

		{#if data.quotes.length > 0}
			<div class="mb-3 divide-y divide-gray-200 border border-gray-200">
				{#each data.quotes as quote (quote.id)}
					<div class="flex items-start gap-3 px-3 py-2">
						<div class="min-w-0 flex-1">
							<p class="text-sm text-gray-900 italic">&ldquo;{quote.text}&rdquo;</p>
							{#if quote.author}
								<p class="text-xs text-gray-500">&mdash; {quote.author}</p>
							{/if}
						</div>
						{#if confirmRemove === quote.id}
							<form
								method="post"
								action="?/deleteQuote"
								use:enhance={() =>
									async ({ update }) => {
										confirmRemove = null;
										await update();
									}}
								class="flex items-center gap-2"
							>
								<input type="hidden" name="id" value={quote.id} />
								<button class="btn btn-danger btn-sm" use:armed>Confirm?</button>
								<button
									type="button"
									onclick={() => (confirmRemove = null)}
									class="text-xs text-gray-500 hover:text-gray-900">Cancel</button
								>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirmRemove = quote.id)}
								class="text-xs text-gray-500 hover:text-red-600"
								><Icon name="trash" /> Remove</button
							>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<EmptyState icon="note" title="No quotes yet" compact />
		{/if}

		<form
			method="post"
			action="?/addQuote"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: true })}
			class="flex flex-wrap items-end gap-2"
		>
			<label class="min-w-64 flex-1">
				<span class="eyebrow text-gray-600">Quote</span>
				<OneLine
					name="text"
					placeholder={'\u201cPlans are worthless, but planning is everything.\u201d'}
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					required
				/>
			</label>
			<label class="w-44">
				<span class="eyebrow text-gray-600">Author</span>
				<OneLine
					name="author"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<button class="btn btn-primary"><Icon name="plus" /> Add</button>
		</form>

		<!-- One at a time is fine for one; nobody types a collection in that way. -->
		<details class="mt-4 border-t border-gray-200 pt-4">
			<summary class="cursor-pointer list-none text-sm text-gray-600 hover:text-gray-900">
				<span class="text-xs text-gray-500">▸</span> Paste a list
			</summary>

			<form
				method="post"
				action="?/importQuotes"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: true })}
				class="mt-3 space-y-2"
			>
				<label class="block">
					<span class="eyebrow text-gray-600">One per line</span>
					<textarea
						name="quotes"
						rows="6"
						class="textarea mt-1"
						placeholder={'Plans are worthless, but planning is everything. — Eisenhower\nWhat gets measured gets managed — Drucker'}
					></textarea>
				</label>
				<p class="text-xs text-gray-500">
					One quote per line. Whatever follows the last dash is the author.
				</p>
				<button class="btn btn-primary"><Icon name="plus" /> Import</button>
			</form>
		</details>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Style</h2>
			<p class="mt-1 text-sm text-gray-500">The shape of things, apart from light and dark.</p>
		</div>

		<form
			method="post"
			action="?/setStyle"
			use:enhance={({ formData }) => {
				// <html> is outside the component tree, so `update()` will not touch it.
				const chosen = formData.get('style')?.toString();
				if (chosen) document.documentElement.dataset.style = chosen;
				return async ({ update }) => update({ reset: false });
			}}
			class="grid gap-3 sm:grid-cols-2"
		>
			{#each data.styles as option (option.key)}
				<button
					type="submit"
					name="style"
					value={option.key}
					class="border p-4 text-left {data.style === option.key
						? 'border-gray-900 bg-gray-50'
						: 'border-gray-300 bg-white hover:bg-gray-50'}"
				>
					<span class="block text-sm font-semibold text-gray-900">{option.label}</span>
					<span class="mt-1 block text-xs text-gray-500">{option.hint}</span>
				</button>
			{/each}
		</form>
	</section>

	<!--
		The language, above Appearance because it changes every other word on
		the page and somebody who cannot read the page is looking for this one.
	-->
	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">{t('settings.language.heading')}</h2>
			<p class="mt-1 text-sm text-gray-500">{t('settings.language.hint')}</p>
		</div>

		<form
			method="post"
			action="?/setLanguage"
			use:enhance={({ formData }) => {
				/*
				 * The device's own copy remembers too.
				 *
				 * An instance running on the device has no server to ask on the
				 * next first paint, so the choice is written where the shell can
				 * read it before the database has opened. See `+layout.ts`.
				 */
				const chosen = formData.get('language')?.toString();
				if (isLocale(chosen)) {
					// <html> is outside the component tree, and it is what a screen
					// reader picks its voice from — the same reason the theme is
					// stamped here rather than waited for.
					document.documentElement.lang = chosen;
					if (isIsolatedBuild()) rememberLocaleOnThisDevice(chosen);
				}
				// Every word on every screen changes, including the ones the shell
				// drew — so this one reloads rather than patching the page.
				return async () => invalidateAll();
			}}
			class="flex flex-wrap gap-2"
		>
			{#each data.languages as language (language.tag)}
				<button
					type="submit"
					name="language"
					value={language.tag}
					lang={language.tag}
					class="border px-4 py-2 text-left text-sm shadow-sm {t.locale === language.tag
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
				>
					{language.name}
					{#if language.untranslated > 0}
						<!-- Said on the button rather than under the section: it is a
						     fact about one language, not about the choice. -->
						<span
							class="mt-0.5 block text-xs font-normal {t.locale === language.tag
								? 'text-gray-300'
								: 'text-gray-500'}"
						>
							{t('settings.language.untranslated', { count: language.untranslated })}
						</span>
					{/if}
				</button>
			{/each}
		</form>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="mb-4">
			<h2 class="text-sm font-semibold text-gray-900">Appearance</h2>
			<p class="mt-1 text-sm text-gray-500">
				&ldquo;System&rdquo; uses whatever your device is set to.
			</p>
		</div>

		<form
			method="post"
			action="?/setTheme"
			data-tour="prefs-theme"
			use:enhance={({ formData }) => {
				// <html> is outside the component tree, so `update()` will not touch it.
				const chosen = formData.get('theme')?.toString();
				if (chosen) document.documentElement.dataset.theme = chosen;
				return async ({ update }) => update({ reset: false });
			}}
			class="flex gap-2"
		>
			{#each THEMES as option (option)}
				<button
					type="submit"
					name="theme"
					value={option}
					class="border px-4 py-2 text-sm capitalize shadow-sm {data.theme === option
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
				>
					{option}
				</button>
			{/each}
		</form>
	</section>

	{#if data.errorReports !== 'off'}
		<section class="border border-gray-200 bg-white p-5 shadow-card">
			<h2 class="text-sm font-semibold text-gray-900">Error reports</h2>
			<p class="mt-1 text-sm text-gray-500">
				When a page breaks, send the technical details to this server's log. Only what broke — never
				what you wrote.
			</p>
			<form
				method="post"
				action="?/setErrorReports"
				use:settingsForm={{ notice: 'Saved.' }}
				class="mt-3 flex gap-2"
			>
				{#each [['yes', 'Send'], ['no', 'Never']] as [value, label] (value)}
					<button
						type="submit"
						name="decision"
						{value}
						class="border px-4 py-2 text-sm shadow-sm {data.errorReports === value
							? 'border-gray-900 bg-gray-900 font-semibold text-white'
							: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
					>
						{label}
					</button>
				{/each}
			</form>
		</section>
	{/if}
</div>
