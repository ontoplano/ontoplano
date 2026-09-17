<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import { ACCOUNT_AUDIOS, AUDIO_KILOBYTES } from '$lib/services/media-limits';
	import { audioMarkdown } from '$lib/audio-markdown';
	import { useT } from '$lib/i18n';

	/**
	 * Put a recording into whatever is being written.
	 *
	 * The same bargain `PictureAttach` makes beside it: the thing lives in the
	 * account's media, and the text carries a link to it. Two ways in, because
	 * both are ordinary — say something now, or reach for one you already made.
	 */
	const t = useT();

	let { target }: { target?: HTMLTextAreaElement } = $props();

	type Held = { id: number; name: string };

	let recording = $state(false);
	/** Whether the microphone was actually given, so the strip can hold back. */
	let started = $state(false);
	let choosing = $state(false);
	let held = $state<Held[]>([]);
	let trouble = $state('');

	/** Insert at the cursor, on a line of its own. The same rule a picture has. */
	function write(text: string) {
		if (!target) return;
		const start = target.selectionStart ?? target.value.length;
		const end = target.selectionEnd ?? start;
		const before = target.value.slice(0, start);
		const lead = before === '' || before.endsWith('\n') ? '' : '\n';
		target.value = before + lead + text + '\n' + target.value.slice(end);
		const to = start + lead.length + text.length + 1;
		target.setSelectionRange(to, to);
		// Nothing is watching this element's value, and nothing autogrows it
		// either, so both are told.
		target.dispatchEvent(new Event('input', { bubbles: true }));
		target.focus();
	}

	async function keep(bytes: Blob, name: string) {
		const body = new FormData();
		body.set('file', bytes, 'recording');
		body.set('label', name);

		const answer = await fetch('/media/audio', { method: 'POST', body });
		const reply = (await answer.json().catch(() => ({}))) as {
			id?: number;
			name?: string;
			message?: string;
		};
		if (!answer.ok || !reply.id) throw new Error(reply.message ?? '');

		write(audioMarkdown(reply.id, reply.name ?? ''));
		recording = false;
	}

	async function openChooser() {
		trouble = '';
		choosing = true;
		const answer = await fetch('/api/recordings');
		if (!answer.ok) {
			trouble = t('attach.noneYet');
			return;
		}
		const reply = (await answer.json()) as { recordings?: Held[] };
		held = reply.recordings ?? [];
	}

	function attach(one: Held) {
		write(audioMarkdown(one.id, one.name));
		choosing = false;
	}
</script>

<div class="mt-2 flex flex-wrap items-center gap-2">
	<button
		type="button"
		class="btn btn-sm"
		onclick={() => {
			// The button is already the answer; the recorder starts on the way in.
			started = false;
			recording = true;
		}}
	>
		<Icon name="mic" class="mr-1.5" />
		{t('attach.recordOne')}
	</button>
	<button type="button" class="btn btn-sm btn-quiet" onclick={openChooser}>
		<Icon name="sound" class="mr-1.5" />
		{t('attach.chooseOne')}
	</button>
</div>

<!-- The same strip the wheel raises, and for the same reason: pressing
     Record inside a screen you opened by pressing Record asks nothing. -->
{#if recording}
	<div
		class="recorder-sheet {started ? '' : 'invisible'}"
		role="group"
		aria-label={t('attach.recording')}
	>
		<Recorder
			autostart
			kilobytes={AUDIO_KILOBYTES}
			atMost={ACCOUNT_AUDIOS}
			onsave={keep}
			onstarted={() => (started = true)}
			onfail={() => (recording = false)}
			ondone={() => (recording = false)}
		/>
	</div>
{/if}

<Modal open={choosing} title={t('attach.chooseOne')} onclose={() => (choosing = false)}>
	{#if trouble}
		<p class="text-sm text-red-600">{trouble}</p>
	{:else if held.length === 0}
		<p class="text-sm text-gray-500">{t('attach.noneYet')}</p>
	{:else}
		<ul class="divide-y divide-gray-200">
			{#each held as one (one.id)}
				<li class="flex items-center gap-3 py-2">
					<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{one.name}</span>
					<audio class="h-8 w-40" controls preload="none" src="/media/audio/{one.id}"></audio>
					<button type="button" class="btn btn-sm btn-primary" onclick={() => attach(one)}>
						{t('attach.attach')}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Modal>
