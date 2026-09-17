<script lang="ts">
	import Banner from '$lib/components/Banner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		openExactAlarmSettings,
		ringerStatus,
		syncRinger,
		type RingerStatus
	} from '$lib/phone-notifications';
	import { useT } from '$lib/i18n';

	/**
	 * Whether this phone will actually wake you, link by link.
	 *
	 * A reminder that does not arrive is the worst failure this app has, and
	 * for most of its life it failed *invisibly*: the alarms are booked by a
	 * receiver with no page open and nobody to report to, so "it did not go
	 * off" had no follow-up question — not for the person, and not for me.
	 *
	 * Every link says where it stands, in the order it can break: is this phone
	 * set up to ring at all, could it reach the instance, is anything actually
	 * booked, will Android let it be on time, will it make a noise. The ones
	 * that are *wrong* are the loud rows; the ones that are fine are a quiet
	 * line of fact underneath, because a screen that shouts when nothing is
	 * wrong is a screen people stop reading.
	 *
	 * It shows nothing at all outside the phone app — there is no shell to ask,
	 * and a row of zeroes claiming nothing is booked would be a lie about a
	 * browser that never books anything.
	 */
	const t = useT();

	let held = $state<RingerStatus | null>(null);
	let checking = $state(false);

	$effect(() => {
		void ringerStatus().then((said) => (held = said));
	});

	/**
	 * Ask the instance now, then read the answer back.
	 *
	 * The sync runs on a thread of the shell's own, so there is nothing to
	 * await: the pause is a guess at how long a request takes, and the worst
	 * case is a row that is one check out of date until this is pressed again.
	 */
	async function checkNow() {
		if (checking) return;
		checking = true;
		await syncRinger();
		await new Promise((r) => setTimeout(r, CHECK_SETTLE_MS));
		held = await ringerStatus();
		checking = false;
	}

	/** Long enough for a request on a poor connection to have landed. */
	const CHECK_SETTLE_MS = 1500;

	/** A stamp, as a time today and a date when it is not today. */
	function when(ms: number): string {
		if (!ms) return '';
		const at = new Date(ms);
		const today = new Date().toDateString() === at.toDateString();
		return at.toLocaleString(t.locale, {
			hour: '2-digit',
			minute: '2-digit',
			...(today ? {} : { day: 'numeric', month: 'short' })
		});
	}

	/*
	 * Only the things that are actually wrong get a banner. In the order they
	 * break the chain: reaching the instance, then being allowed to be on time,
	 * then being allowed to make a noise.
	 */
	const unreachable = $derived(Boolean(held && held.ringingFor && !held.lastLookWorked));
	const late = $derived(Boolean(held && held.ringingFor && !held.exactAllowed));
	const silenced = $derived(Boolean(held && held.ringingFor && !held.channelAudible));
</script>

{#if held && held.ringingFor}
	<div data-tour="ringer-health">
		{#if unreachable}
			<div class="mb-3"><Banner kind="warning">{t('reminders.couldNotReachInstance')}</Banner></div>
		{/if}

		{#if late}
			<div class="mb-3">
				<Banner kind="warning">
					{t('reminders.exactAlarmsRefused')}
					<button
						type="button"
						class="btn btn-sm mt-2"
						onclick={() => void openExactAlarmSettings()}
					>
						{t('reminders.allowExactAlarms')}
					</button>
				</Banner>
			</div>
		{/if}

		{#if silenced}
			<div class="mb-3"><Banner kind="info">{t('reminders.channelSilenced')}</Banner></div>
		{/if}

		<!--
			And the plain facts under them, whether or not anything is wrong.

			This is the part somebody reads when nothing looks broken and the
			reminder still did not arrive: how many alarms are on the phone, when
			the first one is, when this last managed to ask and when it will ask
			again. Between them they say which half of the chain to doubt.
		-->
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
			<span class="flex items-center gap-1.5">
				<Icon name="clock" size={12} />
				{held.booked > 0
					? t('reminders.alarmsOnThisPhone', { count: held.booked })
					: t('reminders.noneBookedYet')}
			</span>

			{#if held.nextRingAt > 0}
				<span>{t('reminders.firstOneAt', { when: when(held.nextRingAt) })}</span>
			{/if}

			<span>
				{held.lastLookAt > 0
					? t('reminders.lastCheckedAt', { when: when(held.lastLookAt) })
					: t('reminders.neverChecked')}
			</span>

			{#if held.nextLookAt > 0}
				<span>{t('reminders.checksAgainAt', { when: when(held.nextLookAt) })}</span>
			{/if}

			<button
				type="button"
				class="underline underline-offset-2"
				onclick={checkNow}
				disabled={checking}
			>
				{t('reminders.checkNow')}
			</button>
		</div>
	</div>
{/if}
