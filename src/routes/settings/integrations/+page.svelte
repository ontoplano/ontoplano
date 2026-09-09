<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import type { ActionData, PageData } from './$types';

	/**
	 * Letting an assistant use this account, for somebody who has never heard
	 * of an API.
	 *
	 * The old page put the two things you paste in the instant after a token
	 * was minted, under a heading about tokens and scopes, on a page that was
	 * mostly webhooks. Everything here is the same mechanism said in the words
	 * somebody would use themselves: a key, what it lets the assistant do, and
	 * the two lines to hand over. The full form — every scope, an expiry, the
	 * grants an assistant has no use for — is still on the Integrations tab for
	 * anybody wiring up a script.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	let naming = $state(false);
	let copied = $state('');

	async function copy(what: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = ''), 1600);
		} catch {
			/* a browser that will not: the text is on screen to select */
		}
	}

	/*
	 * The key, if one was just made, and a placeholder otherwise.
	 *
	 * A key's secret exists in this page for one render and is not recoverable
	 * afterwards — so somebody arriving with a key already made sees the shape
	 * of what to paste and is told plainly where the missing part comes from.
	 */
	const key = $derived(form?.token?.plaintext ?? null);
	const shown = $derived(key ?? 'YOUR_KEY');

	const words = $derived(
		`I use ontoplano — a life management app my assistant can connect to.
Please connect to it and use it whenever I ask you about my week, my to-do
list, my diary, my notebooks, my shopping list or my recipes.

  Address:    ${data.origin}/api/mcp
  Protocol:   MCP, over streamable HTTP (stateless — no session, no GET)
  Key:        send it as an "Authorization: Bearer" header

Once you are connected, tell me what is on my plan today. Do not change
anything in my account until I ask you to.

Key: ${shown}`
	);

	/** One legible line per call: whatever names the thing, never the raw JSON. */
	function callLine(one: {
		args: Record<string, unknown>;
		before: unknown;
		destroyed: boolean;
	}): string {
		const from = { ...(one.args ?? {}), ...((one.before as Record<string, unknown>) ?? {}) };
		const said = [from.title, from.name, from.label, from.content, from.message].find(
			(v) => typeof v === 'string' && v.trim()
		);
		return typeof said === 'string' ? said.slice(0, 80) : '';
	}
</script>

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		What this is, before how to do it.

		Nobody arrives here knowing what MCP is, and they do not need to: the
		thing being offered is that an assistant they already talk to can read
		and change what is in this app. The protocol's name appears once, where
		somebody who does know it will look for it.
	-->
	<Card
		title="Let an AI assistant use this app"
		description="Your week, your to-do list, your diary, your notebooks, your shopping list and your recipes, reachable by an assistant you already talk to. It connects to this instance directly — nothing is sent anywhere else — and you can take the key back at any time."
	>
		<div class="space-y-5">
			<!-- Step one. -->
			<div>
				<span class="eyebrow block text-gray-600">1 · Make a key</span>
				<p class="mt-1 text-sm text-gray-500">
					A key is the password you hand to the assistant. It is shown once, when you make it.
					<strong class="font-semibold text-gray-900">Do not share it with anyone.</strong>
				</p>

				<!--
					The button and the form occupy the same place: naming a key is one
					field, and a form that appears below the button it replaced pushes
					everything under it down the page.
				-->
				{#if naming}
					<form
						method="post"
						action="?/createKey"
						use:enhance={() => {
							return async ({ update }) => {
								naming = false;
								await update();
							};
						}}
						class="mt-2 flex flex-wrap items-center gap-2"
					>
						<div class="flex w-full flex-wrap items-center gap-2">
							<input
								name="label"
								autocomplete="off"
								placeholder="AI assistant"
								class="input w-auto flex-1 sm:max-w-64"
								aria-label="What to call this key"
							/>
							<button class="btn btn-primary btn-sm" type="submit">Make it</button>
							<button type="button" class="btn btn-sm btn-quiet" onclick={() => (naming = false)}>
								Cancel
							</button>
						</div>

						<!--
							What it may do, ticked and changeable.

							Every box is on to begin with, because the whole set is what an
							assistant uses and choosing between eleven of them is not a
							decision most people arrive here able to make. It is still their
							decision: somebody who would rather an assistant never saw their
							diary unticks that one and everything else still works.

							The three grants an assistant has no use for — declaring a plugin,
							managing webhooks, handing out a calendar address — are not on
							this list, and nor is deleting. The Integrations tab has the form
							with all of them.
						-->
						<fieldset class="w-full">
							<legend class="eyebrow text-gray-600">What it may do</legend>
							<p class="mt-1 mb-2 text-xs text-gray-500">
								All of it, unless you say otherwise. Anything unticked stays out of reach.
							</p>
							<div class="space-y-1">
								{#each data.grants as grant (grant.key)}
									<label class="flex items-start gap-2 text-sm text-gray-700">
										<input type="checkbox" name="scopes" value={grant.key} checked class="mt-1" />
										<span>{grant.description}</span>
									</label>
								{/each}
							</div>
							<p class="mt-2 text-xs text-gray-500">
								It cannot delete anything. Everything it writes is listed below, and anything it
								changed can be put back.
							</p>
						</fieldset>
					</form>
				{:else}
					<button type="button" class="btn btn-primary btn-sm mt-2" onclick={() => (naming = true)}>
						Make a key
					</button>
					{#if data.assistants.length > 0}
						<p class="mt-2 text-sm text-gray-500">
							You already have {data.assistants.length === 1
								? `one, “${data.assistants[0].name}”`
								: data.assistants.length}.
							<a
								href={resolve('/settings/integrations/connections')}
								class="underline underline-offset-2"
								>See {data.assistants.length === 1 ? 'it' : 'them'}
								here</a
							>.
							<!-- Red, because it is the sentence somebody is sorry to have
							     missed. On the card's own ground rather than a red wash: red
							     ink on a red fill is unreadable in the dark theme. -->
							<span class="font-semibold text-red-600"
								>Their secrets are only ever shown when they are made</span
							>, so make another if you no longer have it.
						</p>
					{/if}
				{/if}

				{#if key}
					<!--
						Shown once, and said so twice: it is not recoverable, and the
						pasteable things below already have it in them, so the common case
						needs nothing copied from here at all.
					-->
					<div class="mt-3 border border-gray-300 bg-gray-50 p-3">
						<span class="eyebrow block text-gray-600">Your new key — copy it now</span>
						<div class="mt-1 flex items-start gap-2">
							<code class="flex-1 overflow-x-auto font-mono text-xs break-all text-gray-900"
								>{key}</code
							>
							<button type="button" class="btn btn-sm" onclick={() => copy('key', key)}>
								{copied === 'key' ? 'Copied' : 'Copy'}
							</button>
						</div>
						<p class="mt-2 text-xs text-gray-500">
							This is the only time it is shown. It is already in the words below.
						</p>
					</div>
				{/if}
			</div>

			<!--
				Step two: the paste, and only the paste.

				The command used to be first, under "Using Claude Code?", which asked
				somebody to know what they were using before they knew what they were
				doing. Pasting these words is the path that needs nothing explained: an
				assistant with a terminal reads the address and the key and sets itself
				up. Everything that cannot do that — a chat window, an editor — needs a
				configuration file edited, which is a page of its own and lives in the
				docs.
			-->
			<div>
				<span class="eyebrow block text-gray-600">2 · Hand it to your assistant</span>
				<p class="mt-1 text-sm text-gray-500">
					Paste this into the assistant. It says where this app is, what the key is, and what to use
					it for.
				</p>
				<div class="mt-2 flex items-start gap-2">
					<code
						class="flex-1 overflow-x-auto border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-gray-900"
						>{words}</code
					>
					<button type="button" class="btn btn-sm" onclick={() => copy('words', words)}>
						{copied === 'words' ? 'Copied' : 'Copy'}
					</button>
				</div>

				{#if !key}
					<p class="mt-2 text-sm text-gray-500">
						It says <code class="font-mono">YOUR_KEY</code> until you make one above — then it comes with
						the key already in it.
					</p>
				{/if}

				<!--
					The other half, which is a page of its own.

					Pasting works when the assistant can set itself up: it has a terminal,
					so it writes its own configuration. A chat window cannot, and neither
					can an editor — those want a line in a file, and the file is in a
					different place with a different shape for each of them. Doing it that
					way is also the better answer for anybody who means to keep it: it
					lasts past this conversation and the key sits in a config file rather
					than in a transcript.
				-->
				<p class="mt-3 border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
					Assistant cannot set itself up, or you want it there in every conversation?
					<a
						href="{data.docsUrl}/ai-agents"
						class="font-medium underline underline-offset-2"
						target="_blank"
						rel="noreferrer">Claude Code, Codex, Cursor and Claude Desktop, step by step</a
					>.
				</p>
			</div>

			<!-- Step three, which is really "what did I just agree to". -->
			<details class="group">
				<summary
					class="flex cursor-pointer list-none items-center text-sm text-gray-600 hover:text-gray-900"
				>
					What an assistant is allowed to do
					<span class="ml-1 inline-block transition group-open:rotate-90">›</span>
				</summary>
				<ul class="mt-2 space-y-1 text-sm text-gray-500">
					{#each data.grants as grant (grant.key)}
						<li>{grant.description}</li>
					{/each}
				</ul>
				<p class="mt-2 text-sm text-gray-500">
					It cannot delete anything. Everything it writes is listed below, and anything it changed
					can be put back.
				</p>
			</details>
		</div>
	</Card>

	<!--
		What the assistants did.

		Every write answers the caller with the state it replaced, but that answer
		goes to whoever holds the transcript — and the owner of the data holds
		none. This is their copy: the last writes, each with what stood there
		before, and a way back for the ones that removed something.

		Drawn even when it is empty, because this is the page that promises
		somebody an assistant can write here. The promise and the receipt belong
		together.
	-->
	<Card
		title="What your assistants did"
		description="Everything an assistant has changed, newest first. Anything it removed can be put back."
		flush={data.assistantCalls.length > 0}
	>
		{#if data.assistantCalls.length === 0}
			<EmptyState
				icon="plug"
				title="Nothing yet — everything an assistant changes is listed here"
				compact
			/>
		{:else}
			<!-- The pressed row itself turns into "Put back" — that is the
			     confirmation, in place, moving nothing. -->
			<ul class="divide-y divide-gray-200">
				{#each data.assistantCalls as one (one.id)}
					<li class="flex items-center gap-3 px-4 py-2">
						<span class="tabular shrink-0 text-xs text-gray-500">
							{one.createdAt.slice(0, 16).replace('T', ' ')}
						</span>
						<code class="shrink-0 font-mono text-xs text-gray-900">{one.tool}</code>
						<span class="min-w-0 flex-1 truncate text-sm text-gray-700">
							{callLine(one)}
							{#if one.tokenName}
								<span class="text-xs text-gray-500">· {one.tokenName}</span>
							{/if}
						</span>
						{#if one.destroyed}
							{#if one.restoredAt}
								<span class="shrink-0 text-xs text-gray-500">Put back</span>
							{:else}
								<form method="post" action="?/putBack" use:enhance class="shrink-0">
									<input type="hidden" name="id" value={one.id} />
									<button type="submit" class="btn btn-sm">Put it back</button>
								</form>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<p class="text-sm text-gray-500">
		Wiring up a script, a widget or a calendar instead?
		<a href={resolve('/settings/integrations/connections')} class="underline underline-offset-2"
			>Integrations</a
		> has the full form, with every permission and an expiry.
	</p>
</div>
