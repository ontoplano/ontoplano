<script lang="ts">
	import { CAPTURES, visibleCaptures, type Capture } from '$lib/capture';
	import CaptureDialog from '$lib/components/CaptureDialog.svelte';
	import RadialMenu from '$lib/components/RadialMenu.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import { SECTION_COLORS } from '$lib/colors';
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
	/** Whether the microphone was actually given, so the panel can hold back. */
	let started = $state(false);

	/**
	 * The two things the wheel takes in that are not words.
	 *
	 * A picture is chosen from the device; a recording is made here. Both end
	 * up in the Media room, so both wear its colour — and `emphasis` draws them
	 * harder than the four beside them, because six wedges is enough that the
	 * eye needs to find the pair without reading every icon.
	 *
	 * Two tints of one room's colour rather than two colours: the four capture
	 * wedges are coloured by where each thing ends up, and borrowing another
	 * section's colour to tell these two apart would say they go somewhere
	 * else. Same place, two ways in.
	 */
	const MEDIA_TINT = 62;
	const MEDIA_WEDGES = [
		{ key: 'picture', label: 'app.picture' as const, icon: 'image' as const, tint: 100 },
		{ key: 'recording', label: 'app.recording' as const, icon: 'sound' as const, tint: MEDIA_TINT }
	];

	const mediaWedges = $derived(
		MEDIA_WEDGES.map((one) => ({
			key: one.key,
			label: t(one.label),
			icon: one.icon,
			color:
				one.tint === 100
					? SECTION_COLORS.media
					: `color-mix(in srgb, ${SECTION_COLORS.media} ${one.tint}%, white)`,
			emphasis: true
		}))
	);

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

	async function keepRecording(bytes: Blob, name: string, seconds: number) {
		const body = new FormData();
		body.set('file', bytes, 'recording');
		body.set('label', name);
		body.set('seconds', String(seconds));
		const answer = await fetch('/media/audio', { method: 'POST', body });
		if (!answer.ok) {
			const reply = (await answer.json().catch(() => ({}))) as { message?: string };
			throw new Error(reply.message ?? '');
		}
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
	 * The four you write, then the two you add.
	 *
	 * Appended rather than mixed in, so the writing four keep the order they
	 * have always had and the pair reads as a pair — which is the other half of
	 * what `emphasis` is doing.
	 */
	const wedges = $derived([
		...visibleCaptures(hidden).map((c) => ({
			key: c.key,
			label: t(c.label),
			icon: c.icon,
			color: c.color
		})),
		...mediaWedges
	]);

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
		const media = MEDIA_WEDGES.find((one) => one.key === key);
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

<CaptureDialog capture={writing} onclose={() => (writing = null)} />
