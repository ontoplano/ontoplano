<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';

	import RoomBar from '$lib/components/RoomBar.svelte';
	import Written from '$lib/components/Written.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { resolve } from '$app/paths';
	import { useT } from '$lib/i18n';
	import type { PageServerData } from './$types';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const chat = new Chat({
		transport: new DefaultChatTransport({ api: resolve('/api/assistant/chat') })
	});

	let draft = $state('');
	let floor = $state<HTMLElement>();

	const busy = $derived(chat.status === 'submitted' || chat.status === 'streaming');

	function send(event: Event) {
		event.preventDefault();
		const said = draft.trim();
		if (!said || busy) return;
		draft = '';
		chat.sendMessage({ text: said });
	}

	/* The newest words stay on screen while an answer streams in. */
	$effect(() => {
		void chat.messages.length;
		void chat.messages.at(-1)?.parts.length;
		floor?.scrollIntoView({ block: 'end' });
	});
</script>

<RoomBar title={t('assistant.title')}>
	{#snippet actions()}
		<a href={resolve('/settings/integrations')} class="btn btn-sm">
			{t('rooms.settings.title')}
		</a>
	{/snippet}
</RoomBar>

<div class="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4">
	<!-- Which model is on the other end, said with its name rather than
	     described — and the way to change it beside it. -->
	<p class="py-2 text-xs text-gray-500">
		{t('assistant.answeringWith', { provider: data.provider, model: data.model })}
	</p>

	<div class="flex-1 space-y-4">
		{#if chat.messages.length === 0}
			<p class="py-12 text-center text-sm text-gray-500">{t('assistant.askAnything')}</p>
		{/if}

		{#each chat.messages as message (message.id)}
			{#if message.role === 'user'}
				<div class="flex justify-end">
					<div class="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-white">
						{#each message.parts as part, i (i)}
							{#if part.type === 'text'}
								<Written content={part.text} inheritInk />
							{/if}
						{/each}
					</div>
				</div>
			{:else}
				<div class="space-y-1">
					{#each message.parts as part, i (i)}
						{#if part.type === 'text'}
							<Written content={part.text} />
						{:else if part.type === 'dynamic-tool'}
							<!-- What it touched, named — a chat that works your plan in
							     silence is a chat you cannot trust. -->
							<p class="font-mono text-xs text-gray-400">
								{t('assistant.usedTool', { tool: part.toolName })}
							</p>
						{/if}
					{/each}
				</div>
			{/if}
		{/each}

		{#if chat.status === 'submitted'}
			<p class="text-sm text-gray-400">{t('assistant.thinking')}</p>
		{/if}

		{#if chat.status === 'error'}
			<p class="text-sm text-red-600">
				{t('assistant.didNotGoThrough')}
				<button type="button" class="ml-2 underline" onclick={() => chat.regenerate()}>
					{t('assistant.tryAgain')}
				</button>
			</p>
		{/if}

		<div bind:this={floor}></div>
	</div>

	<form onsubmit={send} class="sticky bottom-0 mt-4 flex gap-2 bg-white py-2">
		<OneLine
			name="said"
			bind:value={draft}
			class="input flex-1"
			placeholder={t('assistant.placeholder')}
		/>
		{#if busy}
			<button type="button" class="btn btn-sm" onclick={() => chat.stop()}>
				{t('assistant.stop')}
			</button>
		{:else}
			<button class="btn btn-primary btn-sm" disabled={!draft.trim()}>
				{t('assistant.send')}
			</button>
		{/if}
	</form>
</div>
