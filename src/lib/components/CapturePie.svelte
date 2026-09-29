<script lang="ts">
	import {
		CAPTURES,
		CAPTURE_SETTINGS_GLYPH,
		MEDIA_CAPTURES,
		captureLook,
		visibleCaptures,
		type Capture
	} from '$lib/capture';
	import {
		DEFAULT_CAPTURE_SETTINGS,
		startingNotebook,
		wheelKinds,
		type CaptureSettings
	} from '$lib/capture-settings';
	import CaptureDialog from '$lib/components/CaptureDialog.svelte';
	import CaptureSettingsForm from '$lib/components/CaptureSettingsForm.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { page } from '$app/state';
	import RadialMenu from '$lib/components/RadialMenu.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import { postRecording, type RecordingDraft } from '$lib/recording-upload';
	import { ACCEPTED_TYPES } from '$lib/services/media';
	import { ACCOUNT_AUDIOS, AUDIO_KILOBYTES } from '$lib/services/media-limits';
	import { notify } from '$lib/notify.svelte';
	import { cssVarPx } from '$lib/css-length';
	import { invalidateAll } from '$app/navigation';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * How big this wheel is against the rooms wheel.
	 *
	 * Capture is small things written down in passing — a note, a task, a thing
	 * to buy, something said out loud — and at the rooms wheel's size it took
	 * the whole screen to ask a question that small. Two thirds was too far the
	 * other way: six wedges under a thumb want to be six targets, not a badge.
	 */
	const CAPTURE_SCALE = 0.86;

	/**
	 * Capture, from anywhere.
	 *
	 * The four tiles only ever existed on the dashboard, which is fine for
	 * somebody who opens the app to plan and useless for the far more common
	 * case: you are already looking at something else when the thing you must
	 * not forget arrives.
	 *
	 * So the pie lives in the shell. On a phone it sits bottom-centre, where the
	 * thumb already is — press, flick, release. On a desktop it is a button in
	 * the header that opens the same menu to a click. Navigation happens a few
	 * times an hour; this happens more often, which is why it is the pie's first
	 * job rather than its second.
	 */
	let {
		onopenchange,
		hidden = [],
		/** Which wedges, in what order, and the notebook the forms start in. */
		settings = DEFAULT_CAPTURE_SETTINGS
	}: {
		onopenchange?: (open: boolean) => void;
		hidden?: readonly string[];
		settings?: CaptureSettings;
	} = $props();

	/** The gear beside the wheel has been pressed: its settings are open. */
	let configuring = $state(false);

	/** Where a form opened from here starts — see `startingNotebook`. */
	const notebookId = $derived(
		startingNotebook(settings, {
			id: page.route.id,
			params: page.params,
			search: page.url.searchParams
		})
	);

	let open = $state(false);
	let dragging = $state(false);
	let origin = $state({ x: 0, y: 0 });
	let writing = $state<Capture | null>(null);
	let inset = $state(0);

	/** The file input the picture wedge reaches for, and the recorder's dialog. */
	let picker = $state<HTMLInputElement | null>(null);
	let recording = $state(false);
	/** Whether the microphone was actually given, so the panel can hold back. */
	let started = $state(false);

	function addMedia(key: string) {
		open = false;
		if (key === 'picture') picker?.click();
		else {
			// Pressing Record after pressing Record is a click that asks
			// nothing: the wedge *is* the answer, so the recorder starts on the
			// way in and the panel only shows itself once it has.
			started = false;
			recording = true;
		}
	}

	/**
	 * A chosen file is the whole gesture — there is no second button.
	 *
	 * The input is cleared afterwards either way, so choosing the same file
	 * twice is two uploads rather than one and a silence.
	 */
	async function tookPicture(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		const body = new FormData();
		body.set('file', file, file.name);
		const answer = await fetch('/media', { method: 'POST', body });
		const reply = (await answer.json().catch(() => ({}))) as { message?: string };
		// Capture writes somewhere you are not looking, which is the point of
		// it — so it says so rather than leaving you to go and check.
		if (answer.ok) {
			notify.success(t('media.pictureAdded'));
			await invalidateAll();
		} else notify.error(reply.message ?? '');
	}

	async function keepRecording(draft: RecordingDraft) {
		await postRecording(draft);
		notify.success(t('media.recordingAdded'));
		recording = false;
		/*
		 * And whatever is on screen catches up.
		 *
		 * The wheel reaches every page, including the one that lists
		 * recordings — where saving one left the list exactly as it was and
		 * the only way to see it was to reload by hand.
		 */
		await invalidateAll();
	}

	/*
	 * The four you write, then the two you add — unless the account has
	 * chosen otherwise, in which case its choice and its order.
	 *
	 * The pair is drawn harder than the rest wherever it lands, which is the
	 * other half of what `emphasis` is doing: it keeps them reading as a pair
	 * without having to be next to each other.
	 */
	const available = $derived([
		...visibleCaptures(hidden).map((c) => c.key),
		...MEDIA_CAPTURES.map((m) => m.key)
	]);
	const wedges = $derived(
		wheelKinds(settings, available).flatMap((key) => {
			const look = captureLook(key);
			return look
				? [
						{
							key,
							label: t(look.label),
							icon: look.icon,
							color: look.color,
							emphasis: look.media
						}
					]
				: [];
		})
	);

	function configure() {
		open = false;
		configuring = true;
	}

	/**
	 * Opened by whichever trigger the shell is showing.
	 *
	 * The menu and the form live here once; the buttons live where they make
	 * sense — bottom-centre under a thumb, in the header beside a cursor — and
	 * both call this. Two mounts would mean two dialogs and two half-written
	 * notes.
	 */
	export function summon(e: PointerEvent) {
		// Take the gesture before the browser can. Without this a press-and-hold
		// on a phone becomes a text selection or a scroll, and the release that
		// should have chosen a wedge never reaches us.
		e.preventDefault();
		const button = e.currentTarget as Element | null;
		button?.setPointerCapture?.(e.pointerId);

		// The pie opens under the finger, not under the button: on a phone the
		// button is at the very bottom of the screen and a menu drawn there would
		// be half off it.
		origin = { x: e.clientX, y: e.clientY };
		dragging = e.pointerType !== 'mouse' || e.button === 0;
		inset = bottomInset();
		open = true;
	}

	/**
	 * How much of the bottom of the screen belongs to something else.
	 *
	 * The phone's navigation bar is fixed there, and a pie drawn across it reads
	 * as two interfaces at once. The shell owns the number; this reads it rather
	 * than repeating it.
	 */
	function bottomInset(): number {
		if (typeof window === 'undefined') return 0;
		const px = cssVarPx;
		return window.innerWidth >= 1024 ? 0 : px('--mobile-nav-height') + px('--safe-bottom') + 24;
	}

	function choose(key: string) {
		open = false;
		const media = MEDIA_CAPTURES.find((one) => one.key === key);
		if (media) return addMedia(key);
		writing = CAPTURES.find((c) => c.key === key) ?? null;
	}
</script>

<!--
	One wheel, six wedges: four you write and two you add.

	It was two wheels for a while, side by side. One gesture asking two
	questions is one question too many — the pair is the same press either way,
	and what the eye has to do instead is find two wedges among six, which the
	emphasis below is for.
-->
<RadialMenu
	items={wedges}
	middle="plus"
	name="capture"
	scale={CAPTURE_SCALE}
	{open}
	{origin}
	{dragging}
	bottomInset={inset}
	aside={{
		icon: CAPTURE_SETTINGS_GLYPH,
		label: t('captureSettings.title'),
		tour: 'capture-settings',
		onpress: configure
	}}
	onvisible={(v) => onopenchange?.(v)}
	onselect={choose}
	onclose={() => (open = false)}
/>

<!-- Off screen rather than hidden: a display:none input cannot be clicked. -->
<input
	bind:this={picker}
	type="file"
	accept={ACCEPTED_TYPES.join(',')}
	class="sr-only"
	tabindex="-1"
	aria-hidden="true"
	onchange={tookPicture}
/>

<!--
	The recorder, as a strip along the bottom rather than a dialog.

	A dialog here asked for a second press — Record, inside a screen you opened
	by pressing Record — and covered the app to do it. This sits above the
	navigation bar, over whatever you were looking at, because a recording is
	something you make *while* doing something else.

	`invisible` until it has actually started: the microphone question is
	answered inside `Recorder`, and a refusal is a toast with nothing to show.
	Held rather than unmounted, so it does not flash on the way past.
-->
{#if recording}
	<div
		class="recorder-stage {started ? '' : 'invisible'}"
		role="group"
		aria-label={t('media.newRecording')}
	>
		<div>
			<Recorder
				autostart
				kilobytes={AUDIO_KILOBYTES}
				atMost={ACCOUNT_AUDIOS}
				onsave={keepRecording}
				onstarted={() => (started = true)}
				onfail={() => (recording = false)}
				ondone={() => (recording = false)}
			/>
		</div>
	</div>
{/if}

<CaptureDialog capture={writing} {notebookId} onclose={() => (writing = null)} />

<Modal
	open={configuring}
	onclose={() => (configuring = false)}
	title={t('captureSettings.title')}
	size="sm"
>
	{#if configuring}
		<CaptureSettingsForm
			id="capture-settings-form"
			{settings}
			{hidden}
			saved={() => (configuring = false)}
		/>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (configuring = false)}>{t('ui.cancel')}</button
		>
		<button type="submit" form="capture-settings-form" class="btn btn-primary">
			<Icon name="check" />
			{t('ui.save')}
		</button>
	{/snippet}
</Modal>
