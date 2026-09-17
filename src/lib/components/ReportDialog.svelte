<script lang="ts">
	import { MAX_REPORT_LENGTH } from '$lib/report';
	import { page } from '$app/state';
	import Modal from '$lib/components/Modal.svelte';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	const t = useT();

	/**
	 * Telling whoever runs this instance that something is wrong.
	 *
	 * It used to live inside the help dock, which is the only place that could
	 * open it. The phone reaches it from the fan under the account button
	 * instead, and two copies of a form that posts to the same endpoint is the
	 * kind of thing that drifts — so it is one component both of them open.
	 */
	let {
		open = false,
		onclose
	}: {
		open?: boolean;
		onclose: () => void;
	} = $props();

	let text = $state('');
	let phase = $state<'idle' | 'sending' | 'sent' | 'failed'>('idle');
	/** What the server said when it refused, when it said anything. */
	let problem = $state('');

	/*
	 * A problem and an idea arrive through the same door.
	 *
	 * Somebody who has just noticed something does not want to hunt for the
	 * right form, and an app with a bug button and no suggestion button says
	 * it only wants to hear about failures. One dialog, one press to say
	 * which — and the answer travels, because "the board scrolls wrong" and
	 * "the board should scroll the other way" want reading together and
	 * sorting apart.
	 */
	const KINDS: { key: 'report' | 'suggestion'; label: PlainKey; hint: PlainKey }[] = [
		{
			key: 'report' as const,
			label: 'app.somethingIsWrong',
			hint: 'app.whatYouDidAndWhat'
		},
		{
			key: 'suggestion' as const,
			label: 'app.iHaveAnIdea',
			hint: 'app.whatYouWantedToDo'
		}
	];
	let kind = $state<'report' | 'suggestion'>('report');
	const hint = $derived(KINDS.find((k) => k.key === kind)!.hint);

	async function send() {
		if (!text.trim()) return;
		phase = 'sending';
		try {
			const res = await fetch('/api/report', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message: text.trim(), url: page.url.pathname, kind })
			});
			phase = res.ok ? 'sent' : 'failed';
			if (res.ok) {
				text = '';
				problem = '';
			} else {
				// The server's own sentence when it has one — "that is a lot of
				// reports at once" is worth reading, and "try again in a moment"
				// in its place is a lie.
				problem = await res
					.json()
					.then((body: { message?: string }) => body.message ?? '')
					.catch(() => '');
			}
		} catch {
			phase = 'failed';
		}
	}

	function close() {
		phase = 'idle';
		onclose();
	}

	// Opened afresh, not reopened onto the last send's answer.
	$effect(() => {
		if (open) {
			phase = 'idle';
			kind = 'report';
		}
	});
</script>

<Modal
	{open}
	onclose={close}
	title={t('reportDialog.tellTheOperator')}
	description={t('reportDialog.whereItGoes', { where: page.url.pathname })}
	size="sm"
>
	{#if phase === 'sent'}
		<p class="text-sm text-gray-700">{t('reportDialog.sentThankYouIt')}</p>
	{:else}
		<div class="seg mb-3" role="group" aria-label={t('reportDialog.whatThisIs')}>
			{#each KINDS as k (k.key)}
				<button type="button" onclick={() => (kind = k.key)} aria-pressed={kind === k.key}>
					{t(k.label)}
				</button>
			{/each}
		</div>

		<label class="block">
			<span class="eyebrow text-gray-600">
				{kind === 'suggestion' ? t('reportDialog.yourIdea') : t('reportDialog.whatHappened')}
			</span>
			<textarea
				bind:value={text}
				rows="4"
				maxlength={MAX_REPORT_LENGTH}
				placeholder={t(hint)}
				class="textarea mt-1"
			></textarea>
		</label>

		{#if phase === 'failed'}
			<p class="mt-2 text-xs text-red-700">
				{problem || t('reportDialog.thatDidNotSend')}
			</p>
		{/if}
	{/if}

	{#snippet footer()}
		{#if phase === 'sent'}
			<button type="button" class="btn btn-primary" onclick={close}>{t('ui.close')}</button>
		{:else}
			<button type="button" class="btn" onclick={close}>{t('ui.cancel')}</button>
			<button
				type="button"
				class="btn btn-primary"
				disabled={phase === 'sending' || !text.trim()}
				onclick={send}
			>
				{phase === 'sending' ? t('reportDialog.sending') : t('reportDialog.send')}
			</button>
		{/if}
	{/snippet}
</Modal>
