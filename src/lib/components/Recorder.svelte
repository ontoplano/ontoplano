<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { notify } from '$lib/notify.svelte';
	import { AUDIO_BITS_PER_SECOND } from '$lib/services/media-limits';
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

	/**
	 * What the row will be called if the field is left alone.
	 *
	 * The page that lists recordings works this out on the server, in the
	 * account's own clock, and hands it in. The wheel and the note form do not
	 * — they are components, with no load function behind them — so the field
	 * showed an empty box and "just keep it" looked like it would produce a
	 * row with no name.
	 *
	 * This is the same shape the service falls back to, in the device's clock,
	 * which is the account's clock for anybody whose account is set to where
	 * they are. It is a placeholder: what actually names the row is still the
	 * service, so the two agreeing is a courtesy and not a contract.
	 */
	const fallbackName = $derived(suggestedName || localStamp());

	function localStamp(): string {
		const now = new Date();
		const two = (n: number) => String(n).padStart(2, '0');
		return (
			`${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}` +
			`.${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`
		);
	}
	const size = $derived(held?.size ?? 0);

	function clock(seconds: number): string {
		const whole = Math.max(0, Math.floor(seconds));
		return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
	}

	/**
	 * Let the microphone go, and stop listening for what that causes.
	 *
	 * Stopping the tracks stops the recorder, and a stopped recorder fires
	 * `onstop` — which is where the finished blob is assembled and the review
	 * is opened. So discarding mid-recording *opened the review*: Discard put
	 * up the very thing it was meant to throw away, and the second Discard was
	 * the one that worked.
	 *
	 * The handlers come off first. Whatever the browser fires after this is
	 * about a recording nobody wants.
	 */
	function letGo() {
		if (ticking) clearInterval(ticking);
		ticking = null;
		if (recorder) {
			recorder.onstop = null;
			recorder.ondataavailable = null;
			if (recorder.state !== 'inactive') recorder.stop();
		}
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
			 *
			 * One channel, and the browser's own cleanup: a voice note is one
			 * person talking, so a second channel is the same sound again at
			 * twice the size.
			 */
			track = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			});
		} catch {
			// Refused, or no microphone at all. Either way the app cannot
			// record, and saying which would be guessing at their settings.
			return giveUp(t('audio.noMicrophone'));
		}

		chunks = [];
		elapsed = 0;
		/*
		 * Opus if the browser has it, and a bitrate said out loud.
		 *
		 * Left to itself `MediaRecorder` encodes at whatever it likes, and the
		 * default is generous enough that the 200KB ceiling is about a dozen
		 * seconds — which is a cough, not a voice note. See
		 * `AUDIO_BITS_PER_SECOND`.
		 *
		 * The list is preference order, not a requirement: whichever the
		 * browser admits to supporting is used, and if it admits to none of
		 * them it gets to choose, because a recording in the wrong container is
		 * better than no recording. What the bytes actually are is read back
		 * off them when they are stored.
		 */
		const wanted = [
			'audio/webm;codecs=opus',
			'audio/ogg;codecs=opus',
			'audio/webm',
			'audio/mp4'
		].find((type) => MediaRecorder.isTypeSupported?.(type));

		recorder = new MediaRecorder(track, {
			...(wanted ? { mimeType: wanted } : {}),
			audioBitsPerSecond: AUDIO_BITS_PER_SECOND
		});

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
			/*
			 * The preview may have been playing when Stop was pressed — it is
			 * offered while paused, and listening is often what decides it. The
			 * finished recording is a different, longer thing, so the transport
			 * starts again from the beginning rather than carrying a position
			 * into a file that did not have it.
			 */
			player?.pause();
			playing = false;
			at = 0;

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
		// What has been said so far, playable. See `preview`.
		preview();
	}

	/**
	 * A blob of everything recorded up to now, so a pause can be listened to.
	 *
	 * Waiting until Stop meant deciding whether to carry on without being able
	 * to hear what you had — which is exactly the moment you want to. The
	 * chunks are already in hand; this is them, assembled early.
	 *
	 * A container cut mid-stream often reports no duration, because the index
	 * that would say so is written at the end. `elapsed` is what the clock
	 * says instead, and it is the number a person was watching anyway.
	 */
	function preview() {
		if (!chunks.length) return;
		if (heldUrl) URL.revokeObjectURL(heldUrl);
		held = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
		heldUrl = URL.createObjectURL(held);
		at = 0;
		playing = false;
	}

	function carryOn() {
		if (!recorder || stage !== 'paused') return;
		// The preview is of a recording that is about to grow; playing it while
		// more arrives is listening to something that no longer exists.
		player?.pause();
		if (heldUrl) URL.revokeObjectURL(heldUrl);
		heldUrl = '';
		held = null;
		playing = false;
		recorder.resume();
		stage = 'recording';
	}

	function finish() {
		if (!recorder) return;
		// `stop` fires `ondataavailable` once more and then `onstop`, which is
		// where the blob is assembled — so there is nothing to do here. Unlike
		// `letGo`, the handlers stay on: this one wants what they do.
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

	/**
	 * Keep it, finishing the recording first if it is still open.
	 *
	 * Pausing used to be one step and keeping another: pause, stop-and-keep,
	 * save. Three presses to file one sentence. Pausing now gives everything —
	 * hear it, name it, keep it — and this is what makes Save the second
	 * press: if the recorder is still holding the microphone, it is closed
	 * here and the *finished* bytes are what get sent, not the preview.
	 */
	async function keep() {
		if (saving) return;
		saving = true;
		try {
			const bytes = recorder ? await close() : held;
			if (!bytes) return;
			await onsave(bytes, name.trim());
			discard();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : String(e));
		} finally {
			saving = false;
		}
	}

	/**
	 * Stop the recorder and hand back everything it recorded.
	 *
	 * `stop` is asynchronous in the way that matters: it flushes one last
	 * chunk and *then* fires `onstop`, so reading the chunks straight after it
	 * is reading them one chunk short. This waits for that.
	 */
	function close(): Promise<Blob | null> {
		const open = recorder;
		if (!open) return Promise.resolve(held);

		return new Promise((settle) => {
			open.onstop = () => {
				const bytes = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
				letGo();
				settle(bytes);
			};
			if (open.state === 'inactive') open.onstop(new Event('stop'));
			else open.stop();
		});
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

{#snippet hearing()}
	<!--
		Hearing what is in hand, whether it is finished or not.

		Drawn while paused as well as after Stop, because deciding whether to
		carry on is exactly when somebody wants to know what they have — and
		waiting until the recording is over to offer that is offering it after
		the decision.

		`preload="metadata"` so the bar has a length before anything is played,
		and the bar is a real range: one dragged with a pointer is one a
		keyboard cannot reach.
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
{/snippet}

<div class="space-y-3">
	{#if stage === 'idle'}
		<div class="flex items-center gap-2">
			<button type="button" class="btn btn-primary" onclick={begin} disabled={full}>
				<Icon name="mic" class="mr-1.5" />
				{t('audio.record')}
			</button>
		</div>
	{:else}
		<!--
			One state, three rows, and each row is one decision.

			It used to be two screens: pause, then stop-and-keep, then save —
			three presses to file one sentence. Pausing gives everything now, so
			Save is the second press and it closes the recording on the way.

			Rows rather than one wrapping line, because on a phone a flex row of
			five controls wraps wherever it likes and nothing lines up with
			anything. Top: what it is doing. Middle: hearing it. Bottom: naming
			and keeping it. Each is full width and each aligns to its own left.
		-->
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
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
			{:else if stage === 'paused'}
				<button type="button" class="btn btn-sm" onclick={carryOn}>
					<Icon name="mic" class="mr-1.5" />
					{t('audio.resume')}
				</button>
			{/if}
		</div>

		{#if heldUrl}
			{@render hearing()}
		{/if}

		<!--
			The name, and the two ways out.

			The placeholder is the exact string the row will be filed under, so
			leaving the field alone and typing what it shows are the same act —
			which is what makes "just keep it" a real answer rather than one that
			produces a row called "recording".
		-->
		{#if stage !== 'recording'}
			<div class="flex flex-wrap items-center gap-2">
				<OneLine
					name="label"
					bind:value={name}
					placeholder={fallbackName}
					class="input w-auto min-w-48 flex-1"
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
				{#if held}
					<span class="text-xs text-gray-500">{Math.ceil(size / 1024)}KB</span>
				{/if}
			</div>
		{:else}
			<div class="flex justify-start">
				<button type="button" class="btn btn-sm btn-quiet" onclick={discard}>
					{t('audio.discard')}
				</button>
			</div>
		{/if}
	{/if}

	{#if full && stage === 'idle'}
		<p class="text-sm text-gray-500">{t('audio.full', { count: atMost })}</p>
	{/if}
</div>
