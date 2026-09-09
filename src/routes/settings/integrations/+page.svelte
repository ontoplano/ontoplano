<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import CopyBlock from '$lib/components/CopyBlock.svelte';
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
	/*
	 * The key, if one was just made, and a placeholder otherwise.
	 *
	 * A key's secret exists in this page for one render and is not recoverable
	 * afterwards — so somebody arriving with a key already made sees the shape
	 * of what to paste and is told plainly where the missing part comes from.
	 */
	const key = $derived(form?.token?.plaintext ?? null);
	const shown = $derived(key ?? 'YOUR_KEY');

	/*
	 * One snippet per assistant, and a picker over them.
	 *
	 * There used to be one block and a sentence claiming a `claude mcp add`
	 * command covered "Claude Code, Codex, or anything else with a shell". It
	 * does not: that command is Claude Code's own, and Codex, Cursor and Claude
	 * Desktop each keep their configuration somewhere else, in a different
	 * shape, with a different way of carrying the key. Naming the thing you use
	 * and being handed the right text is the only version of this that is not a
	 * small lie.
	 *
	 * "Just tell it" is first and is the default, because it is the one that
	 * needs nothing explained: an assistant with a terminal reads this and sets
	 * itself up.
	 */
	const clients = $derived([
		{
			id: 'words',
			name: 'Just tell it',
			wrap: true,
			note: 'Works with any assistant that can set itself up — one with a terminal.',
			text: `I use ontoplano — a life management app my assistant can connect to.
Please connect to it and use it whenever I ask you about my week, my to-do
list, my diary, my notebooks, my shopping list or my recipes.

  Address:    ${data.origin}/api/mcp
  Protocol:   MCP, over streamable HTTP (stateless — no session, no GET)
  Key:        send it as an "Authorization: Bearer" header

Once you are connected, tell me what is on my plan today. Do not change
anything in my account until I ask you to.

Key: ${shown}`
		},
		{
			id: 'claude-code',
			name: 'Claude Code',
			wrap: false,
			note: 'Run this in a terminal. It writes the setting for you.',
			text: `claude mcp add --transport http ontoplano ${data.origin}/api/mcp \\\n  --header "Authorization: Bearer ${shown}"`
		},
		{
			id: 'codex',
			name: 'Codex',
			wrap: false,
			note: 'Add this to ~/.codex/config.toml, and export the key in the shell you start Codex from.',
			text: `[mcp_servers.ontoplano]
url = "${data.origin}/api/mcp"
bearer_token_env_var = "ONTOPLANO_KEY"

# then, in your shell:
# export ONTOPLANO_KEY=${shown}`
		},
		{
			id: 'cursor',
			name: 'Cursor',
			wrap: false,
			note: 'Add this to ~/.cursor/mcp.json.',
			text: `{
  "mcpServers": {
    "ontoplano": {
      "url": "${data.origin}/api/mcp",
      "headers": { "Authorization": "Bearer ${shown}" }
    }
  }
}`
		},
		{
			id: 'claude-desktop',
			name: 'Claude Desktop',
			wrap: false,
			note: 'Its connector screen has nowhere to put a key, so this goes through mcp-remote. No space after the colon — Desktop cuts the header in half if you leave one.',
			text: `{
  "mcpServers": {
    "ontoplano": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "${data.origin}/api/mcp",
        "--header", "Authorization:Bearer ${shown}"
      ]
    }
  }
}`
		}
	]);

	let using = $state('words');
	const chosen = $derived(clients.find((c) => c.id === using) ?? clients[0]);

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
		description="Your week, to-do list, diary, shopping list or whatever you want, reachable by an assistant you already talk to."
	>
		<!--
			Room to read.

			Everything here was text-sm at a tight leading, stacked, and stretched
			across the whole of a wide screen — a line of prose nineteen hundred
			pixels long, under a heading four pixels above it. It said "this is
			going to be difficult" before anybody had read a word of it. The steps
			are far enough apart to be two things, the type is the size the rest of
			the app reads at, and a paragraph stops at a length an eye can track
			back from. The card still uses the width; only the sentences stop.
		-->
		<div class="space-y-8">
			<!-- Step one. -->
			<div>
				<h3 class="text-base font-semibold text-gray-900">1 · Make a key</h3>
				<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
					A key is the password you hand to the assistant. It is shown once, when you make it.
					<!-- Its own line, not the tail of the one above: a warning broken across
					     a wrap reads as an afterthought, and this one is the point. -->
					<br />
					<strong class="font-semibold text-red-600">Do not share it with anyone.</strong>
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
							<p class="mt-1 mb-3 max-w-2xl text-xs leading-relaxed text-gray-500">
								All of it, unless you say otherwise. Anything unticked stays out of reach.
							</p>

							<!--
								A grid, not a column of sentences.

								Every grant is a thing and a verb, and written out as twenty-six
								full sentences it was a wall nobody would read — which is the same
								as not showing it at all. One row per thing, one column each for
								reading and writing, and a disabled box where the pair does not
								exist: the shape of what is being handed over is legible in a
								glance down two columns. The sentence is still on the row, as its
								title, for anybody who wants the detail.
							-->
							<div class="max-w-md overflow-x-auto">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b border-gray-200">
											<th class="py-1 text-left font-normal text-gray-500"></th>
											<th class="eyebrow w-16 py-1 text-center text-gray-600">Read</th>
											<th class="eyebrow w-16 py-1 text-center text-gray-600">Write</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200">
										{#each data.permissions as row (row.subject)}
											<tr>
												<td class="py-1.5 text-gray-700" title={row.says.join('\n')}>{row.label}</td
												>
												{#each [row.read, row.write] as scope, i (i)}
													<td class="py-1.5 text-center">
														<!--
															A box that is not offered is drawn anyway, disabled: an
															empty cell reads as a column that ran out, and the
															question "can it write to this?" deserves the answer
															"no, never" rather than no answer.
														-->
														{#if scope}
															<input
																type="checkbox"
																name="scopes"
																value={scope}
																checked
																aria-label="{row.label}: {i === 0 ? 'read' : 'write'}"
															/>
														{:else}
															<input
																type="checkbox"
																disabled
																aria-label="{row.label}: {i === 0
																	? 'read'
																	: 'write'} — not something this can do"
															/>
														{/if}
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>

							<!--
								Deleting, apart from the rest and unticked.

								It is not another column: removing a person or a habit's whole
								history is a different kind of thing from writing to it, and the
								one answer somebody should have to reach for rather than opt out
								of. Red on its own ground, which is the app's colour for a thing
								that goes wrong.
							-->
							<label
								class="mt-3 flex max-w-md items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-gray-700"
							>
								<input type="checkbox" name="scopes" value="destructive" class="mt-0.5" />
								<span>
									<strong class="font-semibold text-red-600">…and let it delete things</strong>
									<span class="mt-0.5 block text-xs leading-relaxed text-gray-500">
										Removing is permanent. Without this, an assistant can add and change things but
										never take them away.
									</span>
								</span>
							</label>
						</fieldset>
					</form>
				{:else}
					<button type="button" class="btn btn-primary btn-sm mt-2" onclick={() => (naming = true)}>
						Make a key
					</button>
					<!--
						The count and the way to them, and nothing else.

						It used to carry the warning about a secret being shown once, which
						put a caution about something that has already happened in front of
						somebody who has not done anything yet. That warning belongs to the
						moment a key exists, and it is there.
					-->
					{#if data.assistants.length > 0}
						<p class="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
							You already have {data.assistants.length === 1
								? `one, “${data.assistants[0].name}”`
								: data.assistants.length}.
							<a
								href={resolve('/settings/integrations/connections')}
								class="underline underline-offset-2"
								>See {data.assistants.length === 1 ? 'it' : 'them'}
								here</a
							>.
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
						<span class="eyebrow block text-gray-600">Your new key</span>
						<div class="mt-1">
							<CopyBlock text={key} label="Copy the key" />
						</div>
						<p class="mt-2 text-xs leading-relaxed text-gray-500">
							<strong class="font-semibold text-gray-900"
								>This secret will only be shown once.</strong
							> It is already in the text below.
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
				<h3 class="text-base font-semibold text-gray-900">2 · Hand it to your assistant</h3>
				<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">Which one are you using?</p>

				<!--
					The picker, and the text under it changing with it.

					A row of names rather than a select: there are five, they are short,
					and what is being chosen changes what is on screen — which is a set
					of tabs, not a form field.
				-->
				<div class="mt-2 flex flex-wrap gap-1">
					{#each clients as client (client.id)}
						<!-- Buttons that press in, not tabs: a tab role promises a tabpanel
						     and arrow-key navigation between them, and half an ARIA pattern
						     is worse to a screen reader than none. `aria-pressed` says what
						     this actually is. -->
						<button
							type="button"
							aria-pressed={using === client.id}
							onclick={() => (using = client.id)}
							class="btn btn-sm {using === client.id ? 'btn-primary' : 'btn-quiet'}"
						>
							{client.name}
						</button>
					{/each}
				</div>

				<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">{chosen.note}</p>

				<div class="mt-2 max-w-3xl">
					<CopyBlock text={chosen.text} wrap={chosen.wrap} label="Copy this" />
				</div>

				{#if !key}
					<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
						It says <code class="font-mono">YOUR_KEY</code> until you make one above — then it comes with
						the key already in it.
					</p>
				{/if}
			</div>
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

	<p class="max-w-2xl text-sm leading-relaxed text-gray-500">
		Wiring up a script, a widget or a calendar instead?
		<a href={resolve('/settings/integrations/connections')} class="underline underline-offset-2"
			>Integrations</a
		> has the full form, with every permission and an expiry.
	</p>
</div>
