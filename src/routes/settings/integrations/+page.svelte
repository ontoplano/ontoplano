<script lang="ts">
	import { enhance } from '$lib/enhance';
	import Icon from '$lib/components/Icon.svelte';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import ChatSettings from '$lib/components/ChatSettings.svelte';
	import { CHAT_IN_APP } from '$lib/features';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import CopyBlock from '$lib/components/CopyBlock.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import type { ActionData, PageData } from './$types';
	import Banner from '$lib/components/Banner.svelte';
	import KeyReach from '$lib/components/KeyReach.svelte';
	import { whyNot } from '$lib/capabilities';
	import { useT } from '$lib/i18n';

	const t = useT();

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

	/** Null on a normal instance; a sentence naming both ways round it otherwise. */
	const assistantsWhyNot = $derived(whyNot(data.capabilities, 'assistants'));

	let naming = $state(false);

	/*
	 * What the key being made is tied to, if anything.
	 *
	 * Held here rather than inside the control because the permissions below it
	 * depend on the answer: a key tied to one notebook can only work on that
	 * notebook's tasks, goals and notes, so every other row is a box that would
	 * grant nothing. `reachable` is the set of grants still worth offering, and
	 * it comes from the tool table by way of the server — nothing on this page
	 * decides which rooms a confinement contains.
	 */
	let tiedTo = $state('');
	let tiedId = $state('');
	const reachable = $derived(
		tiedTo ? (data.reach.find((choice) => choice.kind === tiedTo)?.scopes ?? []) : null
	);
	const reaches = (scope: string | null) => !scope || !reachable || reachable.includes(scope);

	/** The name of the thing it is tied to, which is the name the key wants. */
	const tiedName = $derived(
		data.reach
			.find((choice) => choice.kind === tiedTo)
			?.things.find((thing) => String(thing.id) === tiedId)?.label ?? ''
	);
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
	 * One tab per assistant, and what that assistant needs under it.
	 *
	 * There used to be one block and a sentence claiming a `claude mcp add`
	 * command covered "Claude Code, Codex, or anything else with a shell". It
	 * does not: that command is Claude Code's own, and Codex, Cursor and Claude
	 * Desktop each keep their configuration somewhere else, in a different
	 * shape, with a different way of carrying the key. Naming the thing you use
	 * and being handed the right text is the only version of this that is not a
	 * small lie.
	 *
	 * **A tab is a product, not a way of installing one.** Claude was three of
	 * the six tabs — plugin, command line, desktop — which made a row of
	 * choices out of what is one answer to "which assistant?", and buried Codex
	 * and Cursor at the end of it. Claude is one tab now, and the three ways in
	 * are three labelled blocks inside it: the plugin first, because it is the
	 * shortest, then the command line, then the desktop app, which is the
	 * awkward one and says so.
	 *
	 * "Just tell it" is first and is the default, because it is the one that
	 * needs nothing explained: an assistant with a terminal reads this and sets
	 * itself up.
	 */
	const clients = $derived([
		{
			id: 'words',
			name: t('settings.integrations.justTellIt'),
			wrap: true,
			note: t('settings.integrations.forAnAssistantWithTerminal'),
			/*
			 * It asks for a command to be run, not for a connection.
			 *
			 * This used to open with "Please connect to it", which reads well and
			 * cannot be done: an MCP server is configured before a session starts,
			 * so an assistant that is already running has nothing to press. Every
			 * assistant that was handed this said some version of "I cannot", which
			 * is the worst first five minutes a product can have — the person did
			 * exactly what the page said.
			 *
			 * So it says what to write and where, gives the one command outright
			 * for the assistant most people are pasting this into, and says the
			 * restart out loud rather than leaving somebody to wonder why nothing
			 * happened.
			 */
			/*
			 * In the reader's language, commands and all.
			 *
			 * It is addressed to an assistant, which is the argument for leaving it
			 * in English — but the person pasting it reads it first and decides
			 * whether to trust it, and a wall of English in an otherwise German app
			 * reads as a part that was not finished. The parts that are *code* —
			 * the address, the flags, the header — are the same in every language,
			 * because they are what has to be typed, not what has to be understood.
			 */
			text: t('settings.integrations.tellItPrompt', { origin: data.origin, key: shown })
		},
		{
			id: 'claude',
			name: 'Claude',
			/*
			 * Three ways in, in the order somebody should try them.
			 *
			 * The plugin asks for the address and the key when it installs and
			 * keeps the key where that program keeps secrets — the system
			 * keychain, rather than a header written into a configuration file.
			 * It also brings the standing instructions an assistant otherwise
			 * needs told every conversation: read before writing, never invent
			 * a goal. So it is first, and the other two are for somebody who
			 * cannot use it.
			 */
			ways: [
				{
					name: t('settings.integrations.thePlugin'),
					note: t('settings.integrations.twoLinesInsideClaudeCode'),
					wrap: false,
					text:
						`/plugin marketplace add ontoplano/claude-plugin\n/plugin install ontoplano@ontoplano\n\n` +
						`# ${t('settings.integrations.pluginWillAskFor')}\n` +
						`#   ${t('settings.integrations.pluginAsksYourOntoplano')}  ${data.origin}\n` +
						`#   ${t('settings.integrations.pluginAsksKey')}  ${shown}`
				},
				{
					name: t('settings.integrations.theCommandLine'),
					note: t('settings.integrations.runThisInATerminal'),
					wrap: false,
					text: `claude mcp add --scope user --transport http ontoplano ${data.origin}/api/mcp \\\n  --header "Authorization: Bearer ${shown}"`
				},
				{
					name: t('settings.integrations.theDesktopApp'),
					note: t('settings.integrations.itsConnectorScreenHasNowhere'),
					wrap: false,
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
			]
		},
		{
			id: 'codex',
			name: 'Codex',
			wrap: false,
			note: t('settings.integrations.addThisToCodexConfig'),
			text: `[mcp_servers.ontoplano]
url = "${data.origin}/api/mcp"
bearer_token_env_var = "ONTOPLANO_KEY"

# ${t('settings.integrations.thenOnceInYourShellProfile')}
# export ONTOPLANO_KEY=${shown}`
		},
		{
			id: 'cursor',
			name: 'Cursor',
			wrap: false,
			note: t('settings.integrations.addThisToCursorConfig'),
			text: `{
  "mcpServers": {
    "ontoplano": {
      "url": "${data.origin}/api/mcp",
      "headers": { "Authorization": "Bearer ${shown}" }
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
	<!--
		The chat first, because it is the thing somebody came here to use.

		It had a tab of its own beside this one until the tabs read as three
		rooms where there were two: what the chat runs on is a setting of this
		page. Everything below is how something OUTSIDE the app reaches in.
	-->
	{#if CHAT_IN_APP}
		<ChatSettings {data} {form} />
	{/if}

	<Card
		title={t('settings.integrations.letAnAiAssistantUse')}
		description={t('settings.integrations.yourWeekToDoListDiary')}
	>
		<!--
			Said, not hidden.

			An instance on a phone cannot do this, and the temptation is to drop
			the card. But somebody who installed the app from a store has no other
			way to learn that this exists at all, and a feature nobody can see is a
			feature nobody asks for. So it stays, greyed, with the reason and both
			ways round it — ours is not the only one.
		-->
		{#if assistantsWhyNot}
			<div class="mb-4"><Banner kind="info" message={assistantsWhyNot} /></div>
		{/if}
		<div class:opacity-60={assistantsWhyNot} class:pointer-events-none={assistantsWhyNot}>
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
					<h3 class="text-base font-semibold text-gray-900">
						{t('settings.integrations.1MakeAKey')}
					</h3>
					<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
						{t('settings.integrations.aKeyIsThePassword')}
					</p>

					<!--
					Making a key is a question, so it is asked in a dialog.

					It was a form that took the button's place on the page — which
					meant answering it while the rest of the screen scrolled past
					underneath, and reaching the button that finishes it by going back
					up through everything it asks.
				-->
					<button
						type="button"
						class="btn btn-sm mt-2"
						aria-haspopup="dialog"
						onclick={() => (naming = true)}
					>
						<Icon name="plus" size={16} />
						{t('settings.integrations.createAKey')}
					</button>

					<Modal
						bind:open={naming}
						title={t('settings.integrations.createAKey')}
						description={t('settings.integrations.aKeyIsThePassword')}
						size="lg"
					>
						<form
							id="new-key"
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
							<!--
							The warning, here rather than on the page above.

							It is about a secret that does not exist yet, so it reads as
							scolding somebody who has not done anything — until the moment
							they are about to make one, which is this one.
						-->
							<p class="w-full text-sm font-semibold text-red-600">
								{t('settings.integrations.doNotShareItWith')}
							</p>

							<!--
							What it may do, ticked and changeable.

							Every box is on to begin with, because the whole set is what an
							assistant uses and choosing between eleven of them is not a
							decision most people arrive here able to make. It is still their
							decision: somebody who would rather an assistant never saw their
							diary unticks that one and everything else still works.

							The three grants an assistant has no use for — declaring a plugin,
							managing webhooks, handing out a calendar address — are not on
							this list. Deleting is: its own box under the table, unticked,
							because it is the one grant that should be given on purpose. The
							Integrations tab has the wider form, with every permission and an
							expiry, for a key meant to run a script.
						-->

							<!--
							What it may work on, before what it may do.

							The narrower answer is the one people actually want — "work on
							this project with me" — and it decides which of the boxes below
							mean anything at all.
						-->
							<div class="w-full max-w-md">
								<KeyReach choices={data.reach} bind:kind={tiedTo} bind:id={tiedId} />
							</div>

							<fieldset class="w-full">
								<legend class="eyebrow text-gray-600"
									>{t('settings.integrations.whatItMayDo')}</legend
								>
								<p class="mt-1 mb-3 max-w-2xl text-xs leading-relaxed text-gray-500">
									{t('settings.integrations.allOfItUnlessYou')}
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
												<th class="eyebrow w-16 py-1 text-center text-gray-600"
													>{t('settings.integrations.read')}</th
												>
												<th class="eyebrow w-16 py-1 text-center text-gray-600"
													>{t('settings.integrations.write')}</th
												>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-200">
											{#each data.permissions as row (row.subject)}
												<!--
												A row a confinement cannot reach is drawn faint, not removed.

												Taking it off the table would make the list jump about as
												somebody changes their mind, and would hide the fact that the
												narrowing is what put it out of reach. Faint and unticked says
												the same thing and stays in place.
											-->
												<tr class={reaches(row.read ?? row.write) ? '' : 'opacity-40'}>
													<td class="py-1.5 text-gray-700" title={row.says.join('\n')}
														>{row.label}</td
													>
													{#each [row.read, row.write] as scope, i (i)}
														<td class="py-1.5 text-center">
															<!--
															A box that is not offered is drawn anyway, disabled: an
															empty cell reads as a column that ran out, and the
															question "can it write to this?" deserves the answer
															"no, never" rather than no answer.
														-->
															{#if scope && reaches(scope)}
																<input
																	type="checkbox"
																	name="scopes"
																	value={scope}
																	checked
																	aria-label="{row.label}: {i === 0 ? t('ui.read') : t('ui.write')}"
																/>
															{:else if scope}
																<input
																	type="checkbox"
																	disabled
																	aria-label={t('settings.integrations.outsideWhat', {
																		label: row.label,
																		write: i === 0 ? 'read' : 'write'
																	})}
																/>
															{:else}
																<input
																	type="checkbox"
																	disabled
																	aria-label={t('settings.integrations.notSomething', {
																		label: row.label,
																		write: i === 0 ? 'read' : 'write'
																	})}
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
										<strong class="font-semibold text-red-600"
											>{t('settings.integrations.andLetItDeleteThings')}</strong
										>
										<span class="mt-0.5 block text-xs leading-relaxed text-gray-500">
											{t('settings.integrations.removingIsPermanentWithoutThis')}
										</span>
									</span>
								</label>
							</fieldset>

							<!--
							Naming it and making it, last.

							These were under the warning at the top, which put the button
							that submits the form above every question the form asks — so
							answering them meant scrolling down to read, back up to name it,
							and down again to check. What a thing is called is the last
							thing you decide about it anyway.
						-->
							<div class="mt-4 flex w-full flex-wrap items-center gap-2">
								<!-- Named after what it is tied to, when it is tied to
								     something: a list of keys called "AI assistant" is a list
								     nobody can revoke the right one from. -->
								<OneLine
									name="label"
									placeholder={tiedName || t('settings.integrations.aiAssistant')}
									class="input w-auto flex-1 sm:max-w-64"
									ariaLabel="What to call this key"
									required
								/>
								<button class="btn btn-primary btn-sm" type="submit"
									>{t('settings.integrations.createIt')}</button
								>
								<button type="button" class="btn btn-sm btn-quiet" onclick={() => (naming = false)}>
									{t('ui.cancel')}
								</button>
							</div>
						</form>
					</Modal>

					<!--
						The count and the way to them, and nothing else.

						It used to carry the warning about a secret being shown once, which
						put a caution about something that has already happened in front of
						somebody who has not done anything yet. That warning belongs to the
						moment a key exists, and it is there.
					-->
					{#if data.assistants.length > 0}
						<!-- The count belongs to the link, not to a sentence in front of
							     it: "you already have 4" and "see them here" are one thing to
							     press and were two things to read. -->
						<p class="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
							<a
								href={resolve('/settings/integrations/connections')}
								class="underline underline-offset-2"
								>{t('settings.integrations.seeYourKeys', {
									count: data.assistants.length
								})}</a
							>
						</p>
					{/if}

					{#if key}
						<!--
						Shown once, and said so twice: it is not recoverable, and the
						pasteable things below already have it in them, so the common case
						needs nothing copied from here at all.
					-->
						<div class="mt-3 border border-gray-300 bg-gray-50 p-3">
							<span class="eyebrow block text-gray-600"
								>{t('settings.integrations.yourNewKey')}</span
							>
							<div class="mt-1">
								<CopyBlock text={key} label={t('settings.integrations.copyTheKey')} />
							</div>
							<p class="mt-2 text-xs leading-relaxed text-gray-500">
								<strong class="font-semibold text-gray-900"
									>{t('settings.integrations.thisSecretWillOnlyBe')}</strong
								>
								{t('settings.integrations.itIsAlreadyInThe')}
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
					<h3 class="text-base font-semibold text-gray-900">
						{t('settings.integrations.2HandItTo')}
					</h3>
					<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
						{t('settings.integrations.whichOneAreYouUsing')}
					</p>

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

					<!--
						One assistant's answer: a snippet, or several labelled ways in.

						Claude has three — the plugin, the command line, the desktop app
						— and they are blocks under one tab rather than three tabs,
						because which of them you use is a detail of installing Claude
						and not an answer to "which assistant do you use".
					-->
					{#if chosen.ways}
						<div class="mt-3 max-w-3xl space-y-5">
							{#each chosen.ways as way (way.name)}
								<div>
									<h4 class="eyebrow text-gray-600">{way.name}</h4>
									<p class="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">{way.note}</p>
									<div class="mt-2">
										<CopyBlock
											text={way.text}
											wrap={way.wrap}
											label={t('settings.integrations.copyThis')}
										/>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">{chosen.note}</p>

						<div class="mt-2 max-w-3xl">
							<CopyBlock
								text={chosen.text}
								wrap={chosen.wrap}
								label={t('settings.integrations.copyThis')}
							/>
						</div>
					{/if}

					<!--
					The way to the full instructions, said on the page rather than
					assumed: each snippet here is the shortest correct version, and
					what makes each client keep it — a scope, a shell profile, a
					restart — is a page of its own in the docs.
				-->
					<p class="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
						<a
							href="{data.links.docs}/ai-agents#connect-it"
							rel="external"
							class="underline underline-offset-2">{t('settings.integrations.howToSetEachOne')}</a
						>.
					</p>
				</div>
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
		id="assistant-activity"
		title={t('settings.integrations.whatYourAssistantsDid')}
		description={t('settings.integrations.everythingAnAssistantHasChanged')}
		flush={data.assistantCalls.length > 0}
	>
		{#if data.assistantCalls.length === 0}
			<EmptyState icon="plug" title={t('settings.integrations.nothingYetEverythingAn')} compact />
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
								<span class="shrink-0 text-xs text-gray-500"
									>{t('settings.integrations.putBack')}</span
								>
							{:else}
								<form method="post" action="?/putBack" use:enhance class="shrink-0">
									<input type="hidden" name="id" value={one.id} />
									<button type="submit" class="btn btn-sm"
										>{t('settings.integrations.putItBack')}</button
									>
								</form>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<p class="max-w-2xl text-sm leading-relaxed text-gray-500">
		{t('settings.integrations.wiringUpAScriptA')}
		<a href={resolve('/settings/integrations/connections')} class="underline underline-offset-2"
			>{t('settings.integrations.integrations')}</a
		>
		{t('settings.integrations.hasTheFullFormWith')}
	</p>
</div>
