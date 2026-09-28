<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { sliding } from '$lib/actions/sliding';
	import { invalidateAll } from '$app/navigation';
	import { whileBusy } from '$lib/busy.svelte';
	import { timeOf, type Clock } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { isIsolatedBuild } from '$lib/isolated/mode';
	import { isLocale, useT } from '$lib/i18n';
	import { sectionLabel } from '$lib/sections';
	import ToggleRow from '$lib/components/ToggleRow.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import { tick } from 'svelte';
	import CaptureSettingsForm from '$lib/components/CaptureSettingsForm.svelte';
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

	/*
	 * What each choice actually looks like, rather than its name.
	 *
	 * "24-hour" is a word about a format; `16:00` is the thing you will see on
	 * every screen afterwards. A person picking between them is picking between
	 * two appearances, so the menu shows the appearances.
	 */
	const when = useWhen();
	function clockExample(clock: Clock): string {
		// A time that reads differently either way: 16:00 and 4:00 PM.
		return timeOf('2026-01-01T16:00', { ...when(), clock });
	}

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
			name = new Intl.DisplayNames(t.locale, { type: 'currency' }).of(currency) ?? '';
		} catch {
			/* a runtime without display names still gets the price */
		}
		return {
			price: new Intl.NumberFormat(t.locale, { style: 'currency', currency }).format(12.5),
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

	const dayNames = $derived([
		t('app.monday'),
		t('app.tuesday'),
		t('app.wednesday'),
		t('app.thursday'),
		t('app.friday'),
		t('app.saturday'),
		t('app.sunday')
	]);

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
		notifications = (await askPhoneToNotify(t)) ? 'on' : 'denied';
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
		phoneTested = (await testPhoneNotification(t))
			? t('settings.preferences.phoneTestBooked')
			: t('settings.preferences.phoneTestRefused');
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
				: t('settings.preferences.testSentTo', { count: body.sent ?? 0 });
		} catch {
			tested = t('settings.preferences.testDidNotReach');
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

<!--
	One surface, a subject per band, a setting per row — the shape Account has.
	See `SettingGroup` and `SettingRow`. Fields that answer one question save
	themselves on change; a group whose fields are sent together carries its
	Save in the band's corner, inside the form it saves.
-->
<RoomSurface>
	<!--
		First, because it is what people come here for.

		It was the last section on a long page: somebody who wants the app dark
		scrolled past the timezone, the notifications, the menu and the
		dashboard to find it.
	-->
	<SettingGroup title={t('settings.preferences.appearance')}>
		<SettingRow
			label={t('home.theme')}
			hint={t('settings.preferences.ldquoSystemRdquoUsesWhateverYourDevice')}
		>
			{#snippet control()}
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
					use:sliding
					class="seg"
				>
					{#each THEMES as option (option)}
						<button type="submit" name="theme" value={option} aria-pressed={data.theme === option}>
							{option === 'system'
								? t('app.matchMyDevice')
								: option === 'light'
									? t('app.light')
									: t('app.dark')}
						</button>
					{/each}
				</form>
			{/snippet}
		</SettingRow>
		<!--
			The same control as the theme beside it: two answers to one question
			is a strip of two, not two cards. What each one means is said once,
			under the name, rather than inside the thing being pressed.
		-->
		<SettingRow
			label={t('settings.preferences.style')}
			hint={t('settings.preferences.theShapeOfThingsApart')}
		>
			<ul class="mt-1 space-y-0.5 text-sm text-gray-500">
				{#each data.styles as option (option.key)}
					<li>
						<span class="font-medium text-gray-700">{t(option.label)}</span> — {t(option.hint)}
					</li>
				{/each}
			</ul>
			{#snippet control()}
				<form
					method="post"
					action="?/setStyle"
					use:enhance={({ formData }) => {
						// <html> is outside the component tree, so `update()` will not touch it.
						const chosen = formData.get('style')?.toString();
						if (chosen) document.documentElement.dataset.style = chosen;
						return async ({ update }) => update({ reset: false });
					}}
					use:sliding
					class="seg"
				>
					{#each data.styles as option (option.key)}
						<button
							type="submit"
							name="style"
							value={option.key}
							aria-pressed={data.style === option.key}
						>
							{t(option.label)}
						</button>
					{/each}
				</form>
			{/snippet}
		</SettingRow>
	</SettingGroup>

	<!--
		Where you are and how you read a clock, in one place.

		The language, the 12/24 clock, the timezone, the first day of the week,
		the planner's hours and which day tasks are generated on are one
		subject: every one of them is an answer to "where am I and how do I read
		a time". Each is still its own form posting to the action it always did.
	-->
	<SettingGroup
		title={t('settings.locationAndTime.heading')}
		description={t('settings.locationAndTime.hint')}
	>
		<SettingRow label={t('settings.language.heading')} hint={t('settings.language.hint')}>
			{#snippet control()}
				<form
					method="post"
					action="?/setLanguage"
					class="max-w-full"
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
						// drew — so this one reloads rather than patching the page, with
						// the bar and the turning mark a navigation would have used.
						return async () => void whileBusy(invalidateAll());
					}}
				>
					<!--
						A select, because a language list is a list: two today, a dozen
						when people start sending translations. It submits on change — a
						Save beside a one-field form is a second press for nothing.
					-->
					<select
						name="language"
						class="select w-auto max-w-full"
						value={t.locale}
						aria-label={t('settings.language.heading')}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						{#each data.languages as language (language.tag)}
							<option value={language.tag} lang={language.tag}>
								{language.name}{language.untranslated > 0
									? ` — ${t('settings.language.untranslated', { count: language.untranslated })}`
									: ''}
							</option>
						{/each}
					</select>
				</form>
			{/snippet}
		</SettingRow>
		<SettingRow label={t('settings.clock.heading')} hint={t('settings.clock.hint')}>
			{#snippet control()}
				<form
					method="post"
					action="?/setClock"
					class="max-w-full"
					use:enhance={() => async () => void whileBusy(invalidateAll())}
				>
					<select
						name="clock"
						class="select w-auto max-w-full"
						value={data.clock}
						aria-label={t('settings.clock.heading')}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<option value="auto"
							>{t('settings.clock.auto', { example: clockExample('auto') })}</option
						>
						<option value="12">{t('settings.clock.twelve', { example: clockExample('12') })}</option
						>
						<option value="24"
							>{t('settings.clock.twentyFour', { example: clockExample('24') })}</option
						>
					</select>
				</form>
			{/snippet}
		</SettingRow>
		<!--
			Three fields, one action, and each saves on change like the language
			above: the form listens for any of its fields changing. A Save under
			three selects was a button somebody pressed hoping it kept all three.
		-->
		<form
			method="post"
			action="?/saveWeek"
			use:settingsForm={{ notice: t('settings.preferences.weekSaved') }}
			onchange={(e) => e.currentTarget.requestSubmit()}
			class="divide-y divide-gray-200"
		>
			<SettingRow label={t('settings.preferences.firstDayOfWeek')}>
				{#snippet control()}
					<select
						name="firstDay"
						class="select w-auto max-w-full"
						aria-label={t('settings.preferences.firstDayOfWeek')}
					>
						{#each dayNames as day, i (i)}
							<option value={i} selected={data.week.firstDay === i}>{day}</option>
						{/each}
					</select>
				{/snippet}
			</SettingRow>
			<SettingRow label={t('settings.preferences.generateTasksOn')}>
				{#snippet control()}
					<select
						name="generateDay"
						class="select w-auto max-w-full"
						aria-label={t('settings.preferences.generateTasksOn')}
					>
						{#each dayNames as day, i (i)}
							<option value={i} selected={data.week.generateDay === i}>{day}</option>
						{/each}
					</select>
				{/snippet}
			</SettingRow>
			<SettingRow label={t('settings.preferences.timezone')}>
				{#snippet control()}
					<div class="w-72 max-w-full">
						<TimezonePicker groups={data.zones} value={data.timezone} />
					</div>
				{/snippet}
			</SettingRow>
		</form>
		<!--
			The hours the planner draws.

			Six to midnight is a reasonable default and a poor law: a baker's day
			starts at four and a night shift ends after it.
		-->
		<form
			method="post"
			action="?/saveGridHours"
			use:settingsForm={{ notice: t('settings.preferences.plannerHoursSaved') }}
			onchange={(e) => e.currentTarget.requestSubmit()}
		>
			<SettingRow
				label={t('settings.preferences.plannerHours')}
				hint={t('settings.preferences.theStretchOfTheDay')}
			>
				{#snippet control()}
					<select
						name="start"
						class="select w-auto max-w-full"
						aria-label={t('settings.preferences.dayStartsAt')}
						title={t('settings.preferences.dayStartsAt')}
					>
						{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
							<option value={h} selected={data.gridHours.start === h}>{hourLabel(h)}</option>
						{/each}
					</select>
					<span class="text-sm text-gray-500" aria-hidden="true">–</span>
					<select
						name="end"
						class="select w-auto max-w-full"
						aria-label={t('settings.preferences.dayEndsAt')}
						title={t('settings.preferences.dayEndsAt')}
					>
						{#each Array.from({ length: 24 }, (_, h) => h + 1) as h (h)}
							<option value={h} selected={data.gridHours.end === h}>{hourLabel(h)}</option>
						{/each}
					</select>
				{/snippet}
			</SettingRow>
		</form>
		<!--
			One currency per account: a shopping list in three is a spreadsheet.

			Eight in a list, and a field for the rest. Anything ISO 4217 is
			accepted, and the check is whether the browser will print it — a code
			it cannot format throws on every price on the page. A listed one saves
			on change; a typed one needs its Save, because a code is three letters
			and the first two are not an answer.
		-->
		<form
			method="post"
			action="?/saveCurrency"
			use:settingsForm={{ notice: t('settings.preferences.currencySaved') }}
		>
			<SettingRow
				label={t('settings.preferences.money')}
				hint={t('settings.preferences.whatPricesOnTheShopping')}
			>
				{#if currencyChoice === OTHER}
					<p class="mt-1 text-sm text-gray-500">
						{#if preview}
							{t('settings.preferences.pricesWillRead')}
							<span class="font-medium text-gray-900">{preview.price}</span>{#if preview.name}{t(
									'settings.preferences.nbsp'
								)}
								{preview.name}{/if}.
						{:else if otherCurrency.trim().length === 3}
							<span class="inline-flex items-center gap-1 font-medium text-gray-900"
								><Icon name="warning" size={14} />{t('settings.preferences.isNotACurrency', {
									toUpperCase: otherCurrency.trim().toUpperCase()
								})}</span
							>
						{:else}
							{t('settings.preferences.threeLettersTheIso')}
						{/if}
					</p>
				{/if}
				{#snippet control()}
					<select
						bind:value={currencyChoice}
						aria-label={t('settings.preferences.currency')}
						class="select w-auto max-w-full"
						onchange={async (e) => {
							const form = e.currentTarget.form;
							if (currencyChoice === OTHER) return;
							await tick();
							form?.requestSubmit();
						}}
					>
						{#each data.currencies as code (code)}
							<option value={code}>{code}</option>
						{/each}
						<option value={OTHER}>{t('settings.preferences.another')}</option>
					</select>
					{#if currencyChoice === OTHER}
						<input
							bind:value={otherCurrency}
							maxlength="3"
							autocomplete="off"
							spellcheck="false"
							placeholder={t('settings.preferences.pLN')}
							aria-label={t('settings.preferences.currencyCode')}
							class="input w-24 uppercase"
						/>
						<button class="btn btn-primary btn-sm" disabled={!preview}>{t('ui.save')}</button>
					{/if}
					<!-- One field reaches the server, whichever way it was answered. -->
					<input type="hidden" name="currency" value={currency} />
				{/snippet}
			</SettingRow>
		</form>
	</SettingGroup>

	<!--
		What the app will interrupt you for — an account's answer, not a device's.

		Drawn from the list in `services/notifications.ts` rather than written
		out row by row, so a notification the app gains appears here by existing.
		Each row saves itself: a section-wide Save button over six independent
		switches is a button somebody presses hoping it kept all of them.
	-->
	<SettingGroup title={t('settings.preferences.notifications')}>
		{#each data.notifications as what (what.id)}
			<SettingRow label={t(what.label)} hint={t(what.description)}>
				{#snippet control()}
					<!--
						A wall, said rather than hidden. An instance that runs on the
						phone itself books Android's alarms, so every one of these arrives
						with the app shut — except the Monday mail, which goes out from a
						machine that has to be running on a Monday morning. See
						`capabilities.ts`.
					-->
					{#if what.whyNot}
						<p class="text-sm text-gray-500 sm:max-w-xs">{what.whyNot}</p>
					{:else}
						<form
							method="post"
							action="?/setNotification"
							use:settingsForm={{ notice: t('settings.language.saved') }}
							class="flex items-center justify-end gap-3"
						>
							<input type="hidden" name="id" value={what.id} />
							<!--
								The hour comes with the switch, so turning it on and choosing
								when are one act. Submitted on change rather than behind a
								button of its own.
							-->
							{#if what.at !== null}
								<input
									type="time"
									name="at"
									value={what.at}
									autocomplete="off"
									aria-label={t('settings.preferences.when')}
									class="input w-32"
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
							{/if}
							<!--
								One control for one answer, and it carries its own state. It
								posts `on` only when it is checked, which is what the action
								reads — so changing the hour never turns it off.
							-->
							<input
								type="checkbox"
								name="on"
								value="on"
								class="toggle"
								checked={what.on}
								aria-label={t(what.label)}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
						</form>
					{/if}
				{/snippet}
			</SettingRow>
		{/each}
	</SettingGroup>

	<!--
		Notifications, which are per device and cannot be otherwise.

		Permission belongs to the browser on the machine it was given on, so this
		is not a setting stored against the account: the phone and the laptop
		answer separately. Absent entirely on an instance with no keys, rather
		than shown and broken.
	-->
	{#if page.data.pushKey || inApp}
		<SettingGroup title={t('settings.preferences.notificationsOnThisDevice')}>
			<!--
				One sentence. It said the same thing three times to somebody who
				wanted to know whether their reminders ring and which button turns
				that off.
			-->
			<div class="px-4 py-3">
				<p class="text-sm text-gray-500">
					{#if inApp && notifications === 'unreachable' && data.ringsOnAPhone}
						{t('settings.preferences.remindersFrom')}
						<strong class="text-gray-700">{page.url.host}</strong>
						{t('settings.preferences.ringHereWithTheApp')}
					{:else if inApp && notifications === 'unreachable'}
						{t('settings.preferences.remindersFrom')}
						<strong class="text-gray-700">{page.url.host}</strong>
						{t('settings.preferences.canRingHereWithThe')}
					{:else if inApp}
						{t('settings.preferences.remindersArriveWithTheApp')}
					{:else}
						{t('settings.preferences.remindersArriveWithTheApp2')}
					{/if}
				</p>
				<div class="mt-3">
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
										class="btn btn-sm">{t('settings.preferences.stopRingingOnThisPhone')}</a
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
												result.type === 'success'
													? (result.data as { key?: string })?.key
													: undefined;
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
											? t('settings.preferences.settingItUp')
											: data.ringsOnAPhone
												? t('settings.preferences.setItUpAgain')
												: t('settings.preferences.ringOnThisPhone')}
									</button>
								</form>
							</div>
							{#if ringing === 'failed'}
								<p class="mt-2 text-sm text-gray-600">
									{t('settings.preferences.thisInstanceWouldNotMake')}
								</p>
							{/if}
						{:else if notifications === 'on'}
							<div class="flex flex-wrap items-center gap-3">
								<span class="text-sm text-gray-700">{t('settings.preferences.onForThisPhone')}</span
								>
								<button class="btn btn-sm" onclick={sendPhoneTest}
									>{t('settings.preferences.sendATest')}</button
								>
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
								<span class="text-sm text-gray-700">
									{t('settings.preferences.androidSaidNoAndWill')}
								</span>
								<button class="btn btn-primary btn-sm" onclick={openPhoneSettings}>
									{t('settings.preferences.openThePhoneSSettings')}
								</button>
							</div>
							{#if settingsFailed}
								<p class="mt-2 text-sm text-gray-600">
									{t('settings.preferences.thisPhoneWouldNotOpen')}
								</p>
							{/if}
						{:else}
							<button class="btn btn-primary" onclick={turnOnPhone}
								>{t('settings.preferences.turnOn')}</button
							>
						{/if}
					{:else if notifications === 'unsupported'}
						<p class="text-sm text-gray-500">{t('settings.preferences.thisBrowserCannotDoIt')}</p>
					{:else if notifications === 'denied'}
						<p class="text-sm text-gray-500">
							{t('settings.preferences.blockedForThisSiteIts')}
						</p>
					{:else if notifications === 'on'}
						<div class="flex flex-wrap items-center gap-3">
							<span class="text-sm text-gray-700">{t('settings.preferences.onForThisDevice')}</span>
							<!--
								Six links between "allow" and a phone buzzing, and when nothing
								arrives every one of them is a candidate. This walks the whole
								chain for real — the same code a reminder takes — and says which
								link broke, instead of leaving somebody to set a reminder and
								wait a minute to find out.
							-->
							<button class="btn btn-sm" onclick={sendTest} disabled={testing}>
								<!-- Both words in one cell: the button keeps its width while it works. -->
								<span class="grid">
									<span class="col-start-1 row-start-1" class:invisible={testing}
										>{t('settings.preferences.sendATest')}</span
									>
									<span class="col-start-1 row-start-1" class:invisible={!testing}
										>{t('reportDialog.sending')}</span
									>
								</span>
							</button>
							<button class="btn btn-sm" onclick={turnOff}
								>{t('settings.preferences.turnOff')}</button
							>
						</div>
						{#if tested}
							<p class="mt-2 text-sm text-gray-600">{tested}</p>
						{/if}
					{:else}
						<button class="btn btn-primary" onclick={turnOn}
							>{t('settings.preferences.turnOn')}</button
						>
					{/if}
				</div>
			</div>
		</SettingGroup>
	{/if}

	<!--
		The rooms: one list, three answers — order, shown, colour.

		Home is not here, because Home is not a room: the wordmark in the header
		and the house in the phone bar are the way back.
	-->
	<form
		method="post"
		action="?/saveMenu"
		data-tour="prefs-menu"
		use:settingsForm={{ notice: t('settings.preferences.menuSaved') }}
	>
		<SettingGroup title={t('settings.preferences.theMenu')}>
			{#snippet actions()}
				{#if !data.menuIsDefault}
					<button formaction="?/resetMenu" class="btn btn-sm"
						><Icon name="undo" />{t('settings.preferences.backToTheDefaults')}</button
					>
				{/if}
				<button class="btn btn-primary btn-sm"
					><Icon name="check" />{t('settings.preferences.saveMenu')}</button
				>
			{/snippet}
			<div class="space-y-3 px-4 py-3">
				<p class="max-w-2xl text-sm text-gray-500">
					{t('settings.preferences.theRoomsInTheOrder')}
					<a
						href="https://docs.ontoplano.com/the-wheel"
						class="font-medium text-gray-900 underline"
						rel="external">{t('settings.preferences.howTheWheelIsLaid')}</a
					>{t('settings.preferences.aRoomYouPut')}
				</p>
				<p class="text-xs text-gray-600">
					{t('settings.preferences.pickDarkColoursTheLabels')}
				</p>
				<div class="w-full space-y-2">
					{#each orderedRooms as room, i (room.key)}
						{@const shown = !room.hidden}
						<ToggleRow
							label={t(room.name)}
							on={shown}
							always={!room.hide}
							onToggle={() => toggleRoom(room.key)}
						>
							{#snippet leading()}
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
										aria-label={t('settings.menu.colourFor', { room: t(room.name) })}
									/>
								{:else}
									<!-- Shown, not editable: this room wears another's colour, and
										     three pickers for one value is three ways to disagree. -->
									<span
										class="h-6 w-8 shrink-0 border border-gray-200"
										style="background-color: {room.accent}"
										title={room.colorFrom
											? t('settings.menu.follows', { room: t(room.colorFrom) })
											: ''}
									></span>
								{/if}
							{/snippet}
							{#snippet trailing()}
								{#if room.colorFrom}
									<span class="hidden shrink-0 text-xs text-gray-500 sm:inline"
										>{t('settings.menu.followsShort', { room: t(room.colorFrom) })}</span
									>
								{/if}
								{#if shown}
									<button
										type="button"
										onclick={() => shiftRoom(room.key, -1)}
										disabled={i === 0}
										class="icon-btn"
										title={t('settings.preferences.moveUp')}
										aria-label={t('settings.menu.moveUp', { what: t(room.name) })}
									>
										<Icon name="chevron-up" />
									</button>
									<button
										type="button"
										onclick={() => shiftRoom(room.key, 1)}
										disabled={i === lastShownIndex}
										class="icon-btn"
										title={t('settings.preferences.moveDown')}
										aria-label={t('settings.menu.moveDown', { what: t(room.name) })}
									>
										<Icon name="chevron-down" />
									</button>
								{/if}
							{/snippet}
						</ToggleRow>
						<!--
								The tabs inside the room, one line each, indented under it:
								they are not rooms, and putting Recipes away should leave
								Workouts where it is.
							-->
						{#each room.leaves as leaf (leaf.id)}
							<ToggleRow
								nested
								label={sectionLabel(t, leaf.id)}
								on={!leaf.hidden && !room.hidden}
								locked={room.hidden}
								onToggle={() => toggleLeaf(leaf.id)}
							>
								{#snippet leading()}
									{#if leaf.hidden || room.hidden}
										<input type="hidden" name="hidden" value={leaf.id} />
									{/if}
								{/snippet}
							</ToggleRow>
						{/each}
					{/each}
				</div>
			</div>
		</SettingGroup>
	</form>

	<!--
		The capture wheel: the same form the gear beside the open wheel opens,
		so the settings are not only reachable from inside a gesture.
	-->
	<SettingGroup title={t('captureSettings.title')} description={t('captureSettings.intro')}>
		<div class="px-4 py-3">
			<CaptureSettingsForm
				settings={page.data.captureSettings}
				hidden={data.hiddenSections}
				notebooks={data.captureNotebooks}
			/>
		</div>
	</SettingGroup>

	<!--
		Which cards the dashboard shows, and in what order: the menu's shape, one
		row per card with its switch and its arrows.
	-->
	<form
		method="post"
		action="?/setLayout"
		use:settingsForm={{ notice: t('settings.preferences.dashboardLayoutSaved') }}
	>
		<SettingGroup
			title={t('settings.preferences.dashboard')}
			description={t('settings.preferences.whichCardsAppearAndIn')}
		>
			{#snippet actions()}
				<button formaction="?/resetLayout" class="btn btn-sm"
					><Icon name="undo" />{t('settings.preferences.resetToDefaults')}</button
				>
				<button class="btn btn-primary btn-sm"
					><Icon name="check" />{t('settings.preferences.saveLayout')}</button
				>
			{/snippet}
			<div class="px-4 py-3">
				<div class="w-full space-y-2">
					{#each [...layout, ...data.cards
							.filter((c) => !isOn(c.id))
							.map((c) => c.id)] as id, i (id)}
						{@const card = data.cards.find((c) => c.id === id)}
						{#if card}
							{@const on = isOn(id)}
							<div
								class="toggle-row flex items-center gap-3 border px-3 py-2 text-sm {on
									? 'border-gray-200'
									: 'border-dashed border-gray-300 bg-gray-50'}"
							>
								{#if on}<input type="hidden" name="card" value={id} />{/if}
								<label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
									<input
										type="checkbox"
										class="size-4 shrink-0"
										checked={on}
										onchange={() => toggle(id)}
										aria-label={t(card.label)}
									/>
									<span class="min-w-0 flex-1">
										<span class="block {on ? 'text-gray-900' : 'text-gray-500'}"
											>{t(card.label)}</span
										>
										<span class="block text-xs text-gray-500">{t(card.description)}</span>
									</span>
								</label>
								{#if on}
									<button
										type="button"
										onclick={() => shift(id, -1)}
										disabled={i === 0}
										class="icon-btn"
										title={t('settings.preferences.moveUp')}
										aria-label={t('settings.menu.moveUp', { what: t(card.label) })}
									>
										<Icon name="chevron-up" />
									</button>
									<button
										type="button"
										onclick={() => shift(id, 1)}
										disabled={i === layout.length - 1}
										class="icon-btn"
										title={t('settings.preferences.moveDown')}
										aria-label={t('settings.menu.moveDown', { what: t(card.label) })}
									>
										<Icon name="chevron-down" />
									</button>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</SettingGroup>
	</form>

	<SettingGroup
		title={t('settings.preferences.quotes')}
		description={t('settings.preferences.oneIsShownPerDay')}
	>
		{#each data.quotes as quote (quote.id)}
			<div class="list-row">
				<div class="list-row-main">
					<p class="text-sm text-gray-900 italic">
						{t('settings.preferences.ldquoRdquo', { text: quote.text })}
					</p>
					{#if quote.author}
						<p class="text-xs text-gray-500">
							{t('settings.preferences.mdash', { author: quote.author })}
						</p>
					{/if}
				</div>
				<form
					method="post"
					action="?/deleteQuote"
					use:enhance={() =>
						async ({ update }) => {
							confirmRemove = null;
							await update();
						}}
					class="list-row-actions"
				>
					<input type="hidden" name="id" value={quote.id} />
					{#if confirmRemove === quote.id}
						<button class="btn btn-danger btn-sm" use:armed
							>{t('settings.preferences.confirm')}</button
						>
						<button
							type="button"
							onclick={() => (confirmRemove = null)}
							class="icon-btn"
							title={t('ui.cancel')}
							aria-label={t('ui.cancel')}><Icon name="close" /></button
						>
					{:else}
						<button
							type="button"
							onclick={() => (confirmRemove = quote.id)}
							class="icon-btn icon-btn-danger"
							title={t('ui.remove')}
							aria-label={t('ui.remove')}><Icon name="trash" /></button
						>
					{/if}
				</form>
			</div>
		{:else}
			<div class="px-4">
				<EmptyState icon="note" title={t('settings.preferences.noQuotesYet')} compact />
			</div>
		{/each}
		<form
			method="post"
			action="?/addQuote"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: true })}
			class="flex flex-wrap items-end gap-2 px-4 py-3"
		>
			<label class="min-w-56 flex-[1_1_16rem]">
				<span class="eyebrow text-gray-600">{t('settings.preferences.quote')}</span>
				<OneLine
					name="text"
					placeholder={t('settings.preferences.u201cplansAreWorthlessButPlanning')}
					class="input mt-1"
					required
				/>
			</label>
			<label class="min-w-40 flex-[0_1_12rem]">
				<span class="eyebrow text-gray-600">{t('settings.preferences.author')}</span>
				<OneLine name="author" class="input mt-1" />
			</label>
			<button class="btn btn-primary"><Icon name="plus" /> {t('ui.add')}</button>
		</form>
		<!-- One at a time is fine for one; nobody types a collection in that way. -->
		<details class="group px-4 py-3">
			<summary
				class="flex cursor-pointer list-none items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
			>
				<Icon name="chevron-right" size={12} class="transition-transform group-open:rotate-90" />
				{t('settings.preferences.pasteAList')}
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
					<span class="eyebrow text-gray-600">{t('settings.preferences.onePerLine')}</span>
					<textarea
						name="quotes"
						rows="6"
						class="textarea mt-1"
						placeholder={t('settings.preferences.plansAreWorthlessButPlanning')}
					></textarea>
				</label>
				<p class="text-xs text-gray-500">
					{t('settings.preferences.oneQuotePerLineWhatever')}
				</p>
				<button class="btn btn-primary"
					><Icon name="plus" /> {t('settings.preferences.import')}</button
				>
			</form>
		</details>
	</SettingGroup>

	{#if data.errorReports !== 'off'}
		<SettingGroup title={t('settings.preferences.errorReports')}>
			<SettingRow
				label={t('settings.preferences.errorReports')}
				hint={t('settings.preferences.whenAPageBreaksSend')}
			>
				{#snippet control()}
					<form
						method="post"
						action="?/setErrorReports"
						use:settingsForm={{ notice: t('settings.language.saved') }}
						use:sliding
						class="seg"
					>
						{#each [['yes', t('settings.preferences.send')], ['no', t('settings.preferences.never')]] as [value, label] (value)}
							<button
								type="submit"
								name="decision"
								{value}
								aria-pressed={data.errorReports === value}
							>
								{label}
							</button>
						{/each}
					</form>
				{/snippet}
			</SettingRow>
		</SettingGroup>
	{/if}
</RoomSurface>

<style>
	/* Groups wrapped in the form that saves them still meet at a rule. */
	:global(form + form > .setting-section:first-child) {
		border-top: 1px solid var(--color-gray-200);
	}
</style>
