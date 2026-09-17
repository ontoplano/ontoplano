<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';

	/**
	 * Playing a recording, drawn by this app rather than by the browser.
	 *
	 * `<audio controls>` is the platform's own and the app's rule is to prefer
	 * it — but that rule is about *controls the platform owns*: a date picker, a
	 * select, a file input, where a hand-built replacement loses the keyboard,
	 * the screen reader and the phone's native sheet. A media transport is not
	 * one of those. It is a button and a slider, both of which this app already
	 * has, and the browser's version arrives at a fixed size in a grey of its
	 * own choosing that reads as a foreign object in every list it sits in.
	 *
	 * So: the app's own button, the app's own range. Both are real controls —
	 * the range is an `<input type="range">`, which is exactly what a keyboard
	 * and a screen reader want from a scrub bar.
	 */
	const t = useT();

	let {
		src,
		/** What it is, for anything reading this out. */
		label = '',
		class: klass = ''
	}: { src: string; label?: string; class?: string } = $props();

	let audio = $state<HTMLAudioElement | null>(null);
	let playing = $state(false);
	let at = $state(0);
	let duration = $state(0);

	/**
	 * How long it is, and why it is sometimes not known.
	 *
	 * A container written by `MediaRecorder` often reports `Infinity` until it
	 * has been seeked, because the index that would say otherwise is written
	 * last. Zero until the browser knows, and the bar is inert until then
	 * rather than pretending to a length it does not have.
	 */
	const known = $derived(Number.isFinite(duration) && duration > 0);

	function clock(seconds: number): string {
		const whole = Math.max(0, Math.floor(seconds || 0));
		return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
	}

	function toggle() {
		if (!audio) return;
		if (playing) audio.pause();
		else void audio.play();
	}

	function scrub(event: Event) {
		const to = Number((event.currentTarget as HTMLInputElement).value);
		if (audio && Number.isFinite(to)) audio.currentTime = to;
		at = to;
	}
</script>

<div class="flex items-center gap-2.5 {klass}">
	<!--
		`preload="metadata"` and not `auto`: a list of twenty recordings should
		ask the server for twenty lengths, not twenty recordings.
	-->
	<audio
		bind:this={audio}
		{src}
		preload="metadata"
		onplay={() => (playing = true)}
		onpause={() => (playing = false)}
		onended={() => {
			playing = false;
			at = 0;
		}}
		ontimeupdate={(e) => (at = e.currentTarget.currentTime)}
		onloadedmetadata={(e) => (duration = e.currentTarget.duration)}
		ondurationchange={(e) => (duration = e.currentTarget.duration)}
	></audio>

	<button
		type="button"
		class="btn btn-sm shrink-0"
		onclick={toggle}
		aria-label={playing ? t('audio.pausePlayback') : t('audio.play')}
		title={label || undefined}
	>
		<Icon name={playing ? 'pause' : 'play'} />
	</button>

	<input
		type="range"
		class="h-1.5 min-w-16 flex-1 accent-gray-900"
		min="0"
		max={known ? duration : 1}
		step="0.1"
		value={at}
		disabled={!known}
		oninput={scrub}
		aria-label={t('audio.position')}
	/>

	<span class="shrink-0 text-xs text-gray-500 tabular-nums">
		{clock(at)} / {known ? clock(duration) : '--:--'}
	</span>
</div>
