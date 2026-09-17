<script lang="ts">
	import { CAPTURES, visibleCaptures, type Capture } from '$lib/capture';
	import CaptureDialog from '$lib/components/CaptureDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RadialMenu, { RADIAL_UNITS } from '$lib/components/RadialMenu.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import { ACCEPTED_TYPES } from '$lib/services/media';
	import { ACCOUNT_AUDIOS, AUDIO_KILOBYTES } from '$lib/services/media-limits';
	import { notify } from '$lib/notify.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Two wheels, side by side, sized to the screen rather than to a number.
	 *
	 * The plus used to open one wheel: four things to write down. It opens two
	 * now — what to add on the left, what to write on the right — and they are
	 * independent, so a release over one of them is an answer to that one.
	 *
	 * `RADIAL_UNITS` is what a wheel measures across at `scale: 1`, so two of
	 * them with a gap either side and one between fill a given width at a scale
	 * this arithmetic gives back. Sized down until they fit rather than fixed
	 * at a number somebody picked, because "practically all the width, and not
	 * overlapping" is a relationship and not a size.
	 */
	/** Breathing room at each edge and between the two. */
	const WHEEL_GAP = 14;
	/** Past this the two stop growing — a wheel is a thumb's reach, not a wall. */
	const WHEEL_MAX = 300;

	let width = $state(0);

	const wheelSize = $derived(Math.min(WHEEL_MAX, Math.max(0, (width || 0) - WHEEL_GAP * 3) / 2));
	const wheelScale = $derived(wheelSize / RADIAL_UNITS);

	/**
	 * Where each wheel stands: hard against its own edge of the pair.
	 *
	 * Centred on the middle of the screen as a pair, so that on a wide screen
	 * they are two wheels beside each other rather than one in each corner.
	 */
	const spread = $derived((wheelSize + WHEEL_GAP) / 2);

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
		hidden = []
	}: { onopenchange?: (open: boolean) => void; hidden?: readonly string[] } = $props();

	let open = $state(false);
	let dragging = $state(false);
	let origin = $state({ x: 0, y: 0 });
	let writing = $state<Capture | null>(null);
	let inset = $state(0);

	/** The file input the picture wedge reaches for, and the recorder's dialog. */
	let picker = $state<HTMLInputElement | null>(null);
	let recording = $state(false);

	/**
	 * The left wheel: what to add, as opposed to what to write.
	 *
	 * Two answers, because there are two kinds of thing the app takes in that
	 * are not words. A picture is chosen from the device; a recording is made
	 * here. Both end up in the Media room.
	 */
	/*
	 * Two tints of one room's colour, rather than two colours.
	 *
	 * The right wheel colours each wedge by where the thing ends up, and four
	 * destinations make four colours. Both of these end up in the same room, so
	 * borrowing another section's colour to tell them apart would say something
	 * untrue. Two tints of Media's own says what is the case: one place, two
	 * ways in.
	 */
	const MEDIA_TINT = 62;
	const mediaWedges = $derived([
		{
			key: 'picture',
			label: t('app.picture'),
			icon: 'image' as const,
			color: SECTION_COLORS.media
		},
		{
			key: 'recording',
			label: t('app.recording'),
			icon: 'sound' as const,
			color: `color-mix(in srgb, ${SECTION_COLORS.media} ${MEDIA_TINT}%, white)`
		}
	]);

	function addMedia(key: string) {
		open = false;
		if (key === 'picture') picker?.click();
		else recording = true;
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
		if (answer.ok) notify.success(t('media.pictureAdded'));
		else notify.error(reply.message ?? '');
	}

	async function keepRecording(bytes: Blob, name: string) {
		const body = new FormData();
		body.set('file', bytes, 'recording');
		body.set('label', name);
		const answer = await fetch('/media/audio', { method: 'POST', body });
		if (!answer.ok) {
			const reply = (await answer.json().catch(() => ({}))) as { message?: string };
			throw new Error(reply.message ?? '');
		}
		notify.success(t('media.recordingAdded'));
		recording = false;
	}

	const wedges = $derived(
		visibleCaptures(hidden).map((c) => ({
			key: c.key,
			label: t(c.label),
			icon: c.icon,
			color: c.color
		}))
	);

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
		const style = getComputedStyle(document.documentElement);
		const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
		return window.innerWidth >= 1024 ? 0 : px('--mobile-nav-height') + px('--safe-bottom') + 24;
	}

	function choose(key: string) {
		open = false;
		writing = CAPTURES.find((c) => c.key === key) ?? null;
	}
</script>

<svelte:window bind:innerWidth={width} />

<!--
	Two wheels, and the anchors are what keep them apart.

	Each is told where to stand rather than growing from the finger: one gesture
	opened both, and a pair that both centred on the press would be one wheel
	drawn twice. `bounded` is the other half — the hit test picks by direction
	and has no outer edge, so without it a pointer over the left wheel is also
	*in a direction* from the right one and the release would answer twice.
-->

<RadialMenu
	items={wedges}
	middle="plus"
	name="capture"
	scale={wheelScale}
	bounded
	{open}
	{origin}
	{dragging}
	anchor={{ x: Math.round(width / 2 + spread), y: origin.y }}
	bottomInset={inset}
	onvisible={(v) => onopenchange?.(v)}
	onselect={choose}
	onclose={() => (open = false)}
/>

<RadialMenu
	items={mediaWedges}
	middle="plus"
	name="media"
	scrim={false}
	scale={wheelScale}
	bounded
	{open}
	{origin}
	{dragging}
	anchor={{ x: Math.round(width / 2 - spread), y: origin.y }}
	bottomInset={inset}
	onselect={addMedia}
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

<Modal open={recording} title={t('media.newRecording')} onclose={() => (recording = false)}>
	<Recorder
		kilobytes={AUDIO_KILOBYTES}
		atMost={ACCOUNT_AUDIOS}
		onsave={keepRecording}
		ondone={() => (recording = false)}
	/>
</Modal>

<CaptureDialog capture={writing} onclose={() => (writing = null)} />
