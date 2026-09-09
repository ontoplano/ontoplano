<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import type { ActionData, PageData } from './$types';

	/**
	 * What an assistant can do with this account, and what it has done.
	 *
	 * The connecting was buried: the command and the prompt only appeared in
	 * the instant after a token was minted, on a page about calendar addresses
	 * and webhooks, so somebody who did not already know this existed had no
	 * way to find out that it did. Here it is the page.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

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
	 * The token is a placeholder, and says so.
	 *
	 * A token's secret is shown once, at the moment it is made, and is not
	 * recoverable afterwards — so this page cannot print a working command and
	 * must not pretend to. The shape is the useful part: somebody pastes this
	 * and replaces one obvious word.
	 */
	const PLACEHOLDER = 'YOUR_TOKEN';

	const command = $derived(
		`claude mcp add --transport http ontoplano ${data.origin}/api/mcp \\\n  --header "Authorization: Bearer ${PLACEHOLDER}"`
	);

	const words = $derived(
		`I use ontoplano — a life management app with an MCP server. Please connect to it
and use it whenever I ask you about my week, my todos, my diary, my notebooks,
my shopping list or my recipes.

  MCP endpoint:  ${data.origin}/api/mcp
  Transport:     streamable HTTP (stateless — no session, GET is not supported)
  Auth:          an Authorization: Bearer header

Once connected, list the tools you were offered and tell me what I asked you to
do today. Do not write anything into my account until I ask you to.

Token: ${PLACEHOLDER}`
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
		The pitch and the paste, in that order.

		Somebody arriving here has usually not met an MCP server, so the card
		says what the arrangement is before it hands over a command: their data
		stays where it is, and the assistant is given a key they can take back.
	-->
	<Card
		title="Connect an AI assistant"
		description="Your week, your to-do list, your diary, your notebooks, your shopping list and your recipes, reachable by an assistant you already use — over MCP, from this instance, with a key you can revoke."
	>
		<div class="space-y-4">
			<div>
				<span class="eyebrow block text-gray-600">The endpoint</span>
				<code class="tabular mt-1 block font-mono text-sm break-all text-gray-900"
					>{data.origin}/api/mcp</code
				>
			</div>

			<div>
				<span class="eyebrow block text-gray-600">Claude Code, in one command</span>
				<div class="mt-1 flex items-start gap-2">
					<code
						class="flex-1 overflow-x-auto border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] whitespace-pre text-gray-900"
						>{command}</code
					>
					<button type="button" class="btn btn-sm" onclick={() => copy('command', command)}>
						{copied === 'command' ? 'Copied' : 'Copy'}
					</button>
				</div>
			</div>

			<!--
				Twenty lines of monospace, folded away.

				It is the useful path for an assistant that is not Claude Code, and
				it is also the tallest thing on the page by a distance — open by
				default it pushed the record of what assistants actually did off the
				bottom of a phone. `details` rather than a button of our own: it is
				the control the platform has for exactly this.
			-->
			<details class="group">
				<!-- flex/items-center, as the other summaries in this app are: a touch
				     screen gives a summary 44px, and a block label sits at the top of
				     that box with the rest reading as a gap somebody forgot. -->
				<summary
					class="eyebrow flex cursor-pointer list-none items-center text-gray-600 hover:text-gray-900"
				>
					Or say it in words, to any assistant
					<span class="ml-1 inline-block transition group-open:rotate-90">›</span>
				</summary>
				<div class="mt-1 flex items-start gap-2">
					<code
						class="flex-1 overflow-x-auto border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-gray-900"
						>{words}</code
					>
					<button type="button" class="btn btn-sm" onclick={() => copy('words', words)}>
						{copied === 'words' ? 'Copied' : 'Copy'}
					</button>
				</div>
			</details>

			<!--
				The one thing this page cannot supply.

				A token is shown once and never again, so the snippets above carry a
				placeholder and this says where the real one comes from. Which line
				it shows depends on whether there is already a key that would work —
				"make one" and "you have one, it is not printed here" are different
				sentences and a page that says only the first is wrong half the time.
			-->
			{#if data.assistants.length === 0}
				<p class="text-sm text-gray-500">
					Replace <code class="font-mono">YOUR_TOKEN</code> with a token.
					<a href={resolve('/settings/integrations')} class="underline underline-offset-2"
						>Make one under Integrations</a
					> — the button marked “An AI assistant (MCP)” ticks exactly what it needs.
				</p>
			{:else}
				<p class="text-sm text-gray-500">
					Replace <code class="font-mono">YOUR_TOKEN</code> with a token. You already have
					{data.assistants.length === 1
						? `one — “${data.assistants[0].name}”`
						: `${data.assistants.length} that would work`}, though its secret is only ever shown
					when it is made.
					<a href={resolve('/settings/integrations')} class="underline underline-offset-2"
						>Make another</a
					> if you have lost it.
				</p>
			{/if}
		</div>
	</Card>

	<!--
		What the assistants did.

		Every MCP write answers the caller with the state it replaced, but that
		answer goes to whoever holds the transcript — and the owner of the data
		holds none. This is their copy: the last writes, each with what stood
		there before, and a way back for the calls that deleted something.

		Drawn even when it is empty, unlike on the Integrations page, because
		this is the page that promises somebody an assistant can write here. The
		promise and the receipt belong together.
	-->
	<Card
		title="What your assistants did"
		description="The last writes made over the API, newest first. A deleted thing can be put back."
		flush={data.assistantCalls.length > 0}
	>
		{#if data.assistantCalls.length === 0}
			<EmptyState
				icon="plug"
				title="Nothing yet — every write an assistant makes is listed here"
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
</div>
