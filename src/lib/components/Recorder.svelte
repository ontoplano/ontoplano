<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { notify } from '$lib/notify.svelte';
	import { useT } from '$lib/i18n';

	/**
	 * Say it instead of typing it.
	 *
	 * Four states and they are the whole component: nothing yet, recording,
	 * paused, and one to listen to before it is kept. The last is the reason
	 * this is not a single button — a recording you cannot hear before saving
	 * is one you find out about later, in a list, with no idea which of them is
	 * the one you meant.
	 *
	 * **The ceiling stops it rather than refusing it afterwards.** The service
	 * will refuse anything over the limit, and hitting that after two minutes of
	 * talking is losing two minutes of talking. So the size is watched as the
	 * chunks arrive and recording stops itself on the way past, which leaves
	 * somebody with a recording that is short rather than with nothing.
	 *
	 * **Nothing is uploaded until Save.** The blob lives here; discarding costs
	 * one revoked object URL and no request.
	 */
	const t = useT();

	let {
		/** The ceiling, so this can stop rather than be refused. */
		kilobytes,
		/** Somebody has as many as they may keep: record nothing, say so. */
		full = false,
		/** How many an account may keep, for the sentence that says so. */
		atMost,
		/** The name offered when nobody types one — the moment, from the server. */
		suggestedName = '',
		/** Handed the bytes and the name; returns once it is stored. */
		onsave,
		/** Called when there is nothing in hand any more, so a sheet may close. */
		ondone,
		/**
		 * Start the moment this appears, rather than waiting to be pressed.
		 *
		 * For the places that are *already* an answer to "record something" —
		 * the wheel's wedge, the note form's button. Pressing Record after
		 * pressing Record is a click that asks nothing.
		 */
		autostart = false,
		/** It began. The surface around this can show itself now. */
		onstarted,
		/** It could not begin, and there is nothing to show. */
		onfail
	}: {
		kilobytes: number;
		full?: boolean;
		atMost: number;
		suggestedName?: string;
		onsave: (bytes: Blob, name: string) => Promise<void>;
		ondone?: () => void;
		autostart?: boolean;
		onstarted?: () => void;
		onfail?: (why: string) => void;
	} = $props();

	type Stage = 'idle' | 'recording' | 'paused' | 'review';

	let stage = $state<Stage>('idle');
	let name = $state('');
	let saving = $state(false);

	let recorder: MediaRecorder | null = null;
	let track: MediaStream | null = null;
	let chunks: Blob[] = [];
	let held = $state<Blob | null>(null);
	let heldUrl = $state('');

	/** Seconds recorded, counted from the chunks rather than from a clock. */
	let elapsed = $state(0);
	let ticking: ReturnType<typeof setInterval> | null = null;

	/** How far through the held recording playback is, and how long it is. */
	let player = $state<HTMLAudioElement | null>(null);
	let playing = $state(false);
	let at = $state(0);
	let duration = $state(0);

	const ceiling = $derived(kilobytes * 1024);
	const size = $derived(held?.size ?? 0);

	function clock(seconds: number): string {
		const whole = Math.max(0, Math.floor(seconds));
		return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
	}

	function letGo() {
		if (ticking) clearInterval(ticking);
		ticking = null;
		track?.getTracks().forEach((one) => one.stop());
		track = null;
		recorder = null;
	}

	/**
	 * Say what went wrong where a person will see it, and stand down.
	 *
	 * A toast rather than a line inside this component: when the recorder is
	 * opened already recording, a failure means there is nothing to open — so
	 * a message drawn *in* it would be a panel that exists only to apologise.
	 */
	function giveUp(why: string) {
		notify.error(why);
		onfail?.(why);
	}

	async function begin() {
		if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			return giveUp(t('audio.notSupported'));
		}

		try {
			/*
			 * This is what asks for the microphone.
			 *
			 * On a phone the web view's own client puts the Android permission
			 * question up the first time a page reaches for one — which is the
			 * right moment, because somebody has just pressed Record. It
			 * resolves once they answer, and rejects if they say no.
			 */
			track = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			// Refused, or no microphone at all. Either way the app cannot
			// record, and saying which would be guessing at their settings.
			return giveUp(t('audio.noMicrophone'));
		}

		chunks = [];
		elapsed = 0;
		recorder = new MediaRecorder(track);

		recorder.ondataavailable = (event) => {
			if (!event.data.size) return;
			chunks.push(event.data);

			/*
			 * Stop on the way past the ceiling rather than over it.
			 *
			 * The service refuses anything bigger, and finding that out after
			 * the fact is losing the recording. A short recording is a thing
			 * somebody can use.
			 */
			if (chunks.reduce((n, one) => n + one.size, 0) >= ceiling) {
				notify.info(t('audio.tooLong', { kilobytes }));
				finish();
			}
		};

		recorder.onstop = () => {
			held = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
			if (heldUrl) URL.revokeObjectURL(heldUrl);
			heldUrl = URL.createObjectURL(held);
			stage = 'review';
			letGo();
		};

		// A chunk a second, so the ceiling is noticed within a second of being
		// reached rather than at the end.
		recorder.start(1000);
		stage = 'recording';
		onstarted?.();
		ticking = setInterval(() => {
			if (stage === 'recording') elapsed += 1;
		}, 1000);
	}

	function hold() {
		if (!recorder || stage !== 'recording') return;
		recorder.pause();
		stage = 'paused';
	}

	function carryOn() {
		if (!recorder || stage !== 'paused') return;
		recorder.resume();
		stage = 'recording';
	}

	function finish() {
		if (!recorder) return;
		// `stop` fires `ondataavailable` once more and then `onstop`, which is
		// where the blob is assembled — so there is nothing to do here.
		if (recorder.state !== 'inactive') recorder.stop();
	}

	function discard() {
		letGo();
		if (heldUrl) URL.revokeObjectURL(heldUrl);
		heldUrl = '';
		held = null;
		chunks = [];
		elapsed = 0;
		at = 0;
		duration = 0;
		playing = false;
		name = '';
		stage = 'idle';
		ondone?.();
	}

	function toggle() {
		if (!player) return;
		if (playing) player.pause();
		else void player.play();
	}

	function scrub(event: Event) {
		const to = Number((event.currentTarget as HTMLInputElement).value);
		if (player && Number.isFinite(to)) player.currentTime = to;
		at = to;
	}

	async function keep() {
		if (!held || saving) return;
		saving = true;
		try {
			await onsave(held, name.trim());
			discard();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : String(e));
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		// Once, on the way in. `begin` is what asks for the microphone, so a
		// refusal here is a toast and nothing else appears.
		if (autostart && stage === 'idle') void begin();
	});

	$effect(() => () => {
		letGo();
		if (heldUrl) URL.revokeObjectURL(heldUrl);
	});
</script>

<div class="space-y-3">
	{#if stage === 'idle'}
		<div class="flex items-center gap-2">
			<button type="button" class="btn btn-primary" onclick={begin} disabled={full}>
				<Icon name="mic" class="mr-1.5" />
				{t('audio.record')}
			</button>
		</div>
	{:else if stage === 'recording' || stage === 'paused'}
		<!--
			Recording, and the two things to do about it.

			Pause is the big one because it is the one pressed by accident least
			badly: pausing keeps everything and can be undone, stopping ends the
			recording. Stop only appears once paused, so the two are never one
			mis-tap apart while somebody is still talking.
		-->
		<div class="flex flex-wrap items-center gap-2">
			<span class="inline-flex items-center gap-2 text-sm text-gray-700">
				<span
					class="inline-block h-2.5 w-2.5 rounded-full {stage === 'recording'
						? 'animate-pulse bg-red-600'
						: 'bg-gray-400'}"
					aria-hidden="true"
				></span>
				{stage === 'recording' ? t('audio.recording') : t('audio.paused')}
				<span class="text-gray-500 tabular-nums">{clock(elapsed)}</span>
			</span>

			{#if stage === 'recording'}
				<button type="button" class="btn btn-primary btn-sm" onclick={hold}>
					<Icon name="pause" class="mr-1.5" />
					{t('audio.pause')}
				</button>
			{:else}
				<button type="button" class="btn btn-sm" onclick={carryOn}>
					<Icon name="mic" class="mr-1.5" />
					{t('audio.resume')}
				</button>
				<button type="button" class="btn btn-primary btn-sm" onclick={finish}>
					<Icon name="stop" class="mr-1.5" />
					{t('audio.stop')}
				</button>
			{/if}

			<button type="button" class="btn btn-sm btn-quiet" onclick={discard}>
				{t('audio.discard')}
			</button>
		</div>
	{:else}
		<!--
			Hear it before it is kept.

			`preload="metadata"` so the range has a length to scrub along before
			anything is played, and the range is a real one: a bar somebody drags
			with a pointer is a bar a keyboard cannot reach.
		-->
		<audio
			bind:this={player}
			src={heldUrl}
			preload="metadata"
			onplay={() => (playing = true)}
			onpause={() => (playing = false)}
			onended={() => {
				playing = false;
				at = 0;
			}}
			ontimeupdate={(e) => (at = e.currentTarget.currentTime)}
			onloadedmetadata={(e) => {
				const seconds = e.currentTarget.duration;
				// A `MediaRecorder` blob often reports Infinity until it is seeked.
				duration = Number.isFinite(seconds) ? seconds : elapsed;
			}}
		></audio>

		<div class="flex items-center gap-3">
			<button
				type="button"
				class="btn btn-sm"
				onclick={toggle}
				aria-label={playing ? t('audio.pausePlayback') : t('audio.play')}
			>
				<Icon name={playing ? 'pause' : 'play'} />
			</button>

			<input
				type="range"
				class="h-1.5 flex-1 accent-gray-900"
				min="0"
				max={Math.max(duration, 0.1)}
				step="0.1"
				value={at}
				oninput={scrub}
				aria-label={t('audio.position')}
			/>

			<span class="shrink-0 text-sm text-gray-500 tabular-nums">
				{clock(at)} / {clock(duration || elapsed)}
			</span>
		</div>

		<!--
			The name, and the two ways out.

			The placeholder is the exact string the service falls back to, so
			leaving it alone and typing what it shows are the same act — which is
			what makes "just save it" a real option rather than a thing that
			produces a row called "recording".
		-->
		<div class="flex flex-wrap items-center gap-2">
			<OneLine
				name="label"
				bind:value={name}
				placeholder={suggestedName}
				class="input w-auto flex-1 sm:max-w-72"
				ariaLabel={t('audio.nameIt')}
			/>
			<button type="button" class="btn btn-primary btn-sm" onclick={keep} disabled={saving}>
				<Icon name="check" class="mr-1.5" />
				{saving ? t('audio.saving') : t('audio.save')}
			</button>
			<button type="button" class="btn btn-sm btn-quiet" onclick={discard} disabled={saving}>
				<Icon name="trash" class="mr-1.5" />
				{t('audio.discard')}
			</button>
			<span class="text-xs text-gray-500">{Math.ceil(size / 1024)}KB</span>
		</div>
	{/if}

	{#if full && stage === 'idle'}
		<p class="text-sm text-gray-500">{t('audio.full', { count: atMost })}</p>
	{/if}
</div>
