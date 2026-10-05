<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import { momentOf } from '$lib/when';
	import { enhance } from '$lib/enhance';
	import Icon from '$lib/components/Icon.svelte';
	import { resolve } from '$app/paths';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Field from '$lib/components/Field.svelte';
	import { sliding } from '$lib/actions/sliding';
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
	import PermissionGrid from '$lib/components/PermissionGrid.svelte';
	import { whyNot } from '$lib/capabilities';
	import { useT } from '$lib/i18n';
	import { callLine } from '$lib/assistant-calls';

	const t = useT();
	const now = useWhen();

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
	/* One assistant's answer as blocks: Claude's three ways, or the one snippet. */
	const blocks = $derived(
		chosen.ways ?? [
			{ name: '', note: chosen.note ?? '', wrap: chosen.wrap, text: chosen.text ?? '' }
		]
	);
</script>

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		The chat first, because it is the thing somebody came here to use. What
		the chat runs on is a setting of this page; everything below is how
		something OUTSIDE the app reaches in.
	-->
	{#if CHAT_IN_APP}
		<ChatSettings {data} {form} />
	{/if}

	<!-- One surface, a subject per band, a setting per row — the shape every
	     settings screen shares. See `SettingGroup` and `SettingRow`. -->
	<RoomSurface>
		<SettingGroup
			title={t('settings.integrations.letAnAiAssistantUse')}
			description={t('settings.integrations.yourWeekToDoListDiary')}
		>
			<!--
				Said, not hidden.

				An instance on a phone cannot do this, and the temptation is to drop
				the section. But somebody who installed the app from a store has no
				other way to learn that this exists at all. So it stays, greyed, with
				the reason and both ways round it.
			-->
			{#if assistantsWhyNot}
				<div class="px-4 py-3"><Banner kind="info" message={assistantsWhyNot} /></div>
			{/if}
			<div
				class="divide-y divide-gray-200"
				class:opacity-60={assistantsWhyNot}
				class:pointer-events-none={assistantsWhyNot}
			>
				<!-- Step one: the key. Making one is a question, so it is asked in a
				     dialog rather than in a form that takes the button's place. -->
				<SettingRow
					label={t('settings.integrations.1MakeAKey')}
					hint={t('settings.integrations.aKeyIsThePassword')}
				>
					{#if data.assistants.length > 0}
						<!-- The count belongs to the link: "you already have 4" and "see
						     them here" are one thing to press. -->
						<p class="mt-1 text-sm text-gray-500">
							<a
								href={resolve('/settings/integrations/connections')}
								class="underline underline-offset-2"
								>{t('settings.integrations.seeYourKeys', { count: data.assistants.length })}</a
							>
						</p>
					{/if}
					{#if key}
						<!--
							Shown once, and said so: it is not recoverable, and the pasteable
							things below already have it in them, so the common case needs
							nothing copied from here at all.
						-->
						<div class="mt-3 max-w-3xl border border-gray-300 bg-gray-50 p-3">
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
					{#snippet control()}
						<button
							type="button"
							class="btn btn-sm"
							aria-haspopup="dialog"
							onclick={() => (naming = true)}
						>
							<Icon name="plus" />
							{t('settings.integrations.createAKey')}
						</button>
					{/snippet}
				</SettingRow>

				<!--
					Step two: the paste, and only the paste.

					An assistant with a terminal reads the address and the key and sets
					itself up; everything that cannot — a chat window, an editor — needs
					a configuration file edited, which is a page of its own in the docs.
				-->
				<SettingRow
					wide
					label={t('settings.integrations.2HandItTo')}
					hint={t('settings.integrations.whichOneAreYouUsing')}
				>
					<!--
						Buttons that press in, in the one segmented control: a tab role
						promises a tabpanel and arrow-key navigation, and half an ARIA
						pattern is worse to a screen reader than none.
					-->
					<div
						use:sliding
						class="seg seg-sm mt-2"
						role="group"
						aria-label={t('settings.integrations.whichOneAreYouUsing')}
					>
						{#each clients as client (client.id)}
							<button
								type="button"
								aria-pressed={using === client.id}
								onclick={() => (using = client.id)}
							>
								{client.name}
							</button>
						{/each}
					</div>
					<!--
						One assistant's answer: a snippet, or several labelled ways in.
						Claude has three — the plugin, the command line, the desktop app —
						and they are blocks under one choice rather than three choices.
					-->
					<!--
						What it is beside the text to paste: the words in a column of
						their own, the block in the width that is left, so a short
						snippet does not leave half the row empty beside it.
					-->
					<div class="mt-3 space-y-5">
						{#each blocks as way (way.name)}
							<div class="snippet grid gap-2 lg:gap-6">
								<div>
									{#if way.name}<h4 class="eyebrow text-gray-600">{way.name}</h4>{/if}
									<p class="text-sm leading-relaxed text-gray-500" class:mt-1={way.name}>
										{way.note}
									</p>
								</div>
								<CopyBlock
									text={way.text}
									wrap={way.wrap}
									label={t('settings.integrations.copyThis')}
								/>
							</div>
						{/each}
					</div>
					<!-- Each snippet is the shortest correct version; what makes each
					     client keep it is a page of its own in the docs. -->
					<p class="mt-3 text-sm leading-relaxed text-gray-500">
						<a
							href="{data.links.docs}/ai-agents#connect-it"
							rel="external"
							class="underline underline-offset-2">{t('settings.integrations.howToSetEachOne')}</a
						>.
					</p>
				</SettingRow>

				<!-- The wider form, for a key meant to run a script. -->
				<SettingRow
					label={t('settings.integrations.integrations')}
					hint={t('settings.integrations.scriptsWidgetsCalendars')}
				>
					{#snippet control()}
						<a href={resolve('/settings/integrations/connections')} class="btn btn-sm">
							<Icon name="arrow-right" />
							{t('settings.integrations.integrations')}
						</a>
					{/snippet}
				</SettingRow>
			</div>
		</SettingGroup>

		<!--
			What the assistants did.

			Every write answers the caller with the state it replaced, but that
			answer goes to whoever holds the transcript — and the owner of the data
			holds none. This is their copy: the last writes, and a way back for the
			ones that removed something. Drawn even when empty: the promise and the
			receipt belong together.
		-->
		<SettingGroup
			id="assistant-activity"
			title={t('settings.integrations.whatYourAssistantsDid')}
			description={t('settings.integrations.everythingAnAssistantHasChanged')}
		>
			{#each data.assistantCalls as one (one.id)}
				<div class="list-row">
					<div class="list-row-main flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
						<span class="tabular shrink-0 text-xs text-gray-500">
							{momentOf(one.createdAt, now())}
						</span>
						<code class="shrink-0 font-mono text-xs text-gray-900">{one.tool}</code>
						<span class="min-w-0 flex-1 truncate text-sm text-gray-700">
							{callLine(one)}
							{#if one.tokenName}
								<span class="text-xs text-gray-500">· {one.tokenName}</span>
							{/if}
						</span>
					</div>
					{#if one.destroyed}
						<div class="list-row-actions">
							{#if one.restoredAt}
								<span class="text-xs text-gray-500">{t('settings.integrations.putBack')}</span>
							{:else}
								<form method="post" action="?/putBack" use:enhance>
									<input type="hidden" name="id" value={one.id} />
									<button
										type="submit"
										class="icon-btn"
										title={t('settings.integrations.putItBack')}
										aria-label={t('settings.integrations.putItBack')}
									>
										<Icon name="undo" />
									</button>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<EmptyState icon="plug" title={t('settings.integrations.nothingYetEverythingAn')} compact />
			{/each}
		</SettingGroup>
	</RoomSurface>

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
			class="space-y-4"
		>
			<!-- The warning belongs to the moment a secret is about to exist, not
			     to the page above, where it scolds somebody who has done nothing. -->
			<Banner kind="warning" message={t('settings.integrations.doNotShareItWith')} />
			<!--
				What it may work on, before what it may do: the narrower answer is
				the one people want — "work on this project with me" — and it decides
				which of the boxes below mean anything at all.
			-->
			<div class="max-w-md">
				<KeyReach choices={data.reach} bind:kind={tiedTo} bind:id={tiedId} />
			</div>
			<!--
				What it may do. Every box starts off: a grant is given on purpose, one
				row or the All box at a time, and deleting is its own box under the
				table.
			-->
			<fieldset>
				<legend class="eyebrow text-gray-600">{t('settings.integrations.whatItMayDo')}</legend>
				<p class="mt-1 mb-3 max-w-2xl text-xs leading-relaxed text-gray-500">
					{t('settings.integrations.onlyWhatYouTick')}
				</p>
				<PermissionGrid scopes={data.permissions} {reachable} destructive />
			</fieldset>
			<!-- Naming it, last: what a thing is called is the last thing you decide
			     about it. Named after what it is tied to, when it is tied. -->
			<FormGrid>
				<Field label={t('settings.integrations.whatToCallThisKey')} span={6} required>
					<OneLine
						name="label"
						placeholder={tiedName || t('settings.integrations.aiAssistant')}
						class="input"
						ariaLabel={t('settings.integrations.whatToCallThisKey')}
						required
					/>
				</Field>
			</FormGrid>
		</form>
		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (naming = false)}>{t('ui.cancel')}</button>
			<button class="btn btn-primary" type="submit" form="new-key"
				>{t('settings.integrations.createIt')}</button
			>
		{/snippet}
	</Modal>
</div>

<style>
	@media (width >= 64rem) {
		.snippet {
			grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
		}
	}
</style>
