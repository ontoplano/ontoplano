<script lang="ts">
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>Privacy · ontoplano</title></svelte:head>

<h1>Privacy</h1>
<p class="updated">Last updated {data.updated}. Written to be read, not to be survived.</p>

<p>
	ontoplano holds a diary. That is the whole reason this page is specific rather than a template:
	the thing you are storing here is the sort of thing you would not want read.
</p>

<h2>What is stored</h2>
<ul>
	<li>Your email address and name, because an account needs a way to be signed in to.</li>
	<li>A hash of your password. Not the password.</li>
	<li>
		Everything you write: blocks, tasks, goals, diary entries, notebooks, people, habits, ideas,
		shopping, quotes, and the numbers any plugin you connect pushes in.
	</li>
	<li>
		A short history of what happened to your account — signing in, changing a password, exporting, a
		plan change. You can see the same list an administrator can.
	</li>
	<li>The address you connected from, alongside those events, for as long as they are kept.</li>
</ul>

<h2>Where it is stored</h2>
<p>
	In one SQLite database on {data.hosted
		? 'the server that runs this instance'
		: 'the machine you installed it on'}.
	{#if data.hosted}
		Backups are replicated to object storage so a dead disk is an inconvenience rather than the end
		of your diary.
	{:else}
		Backups are whatever you configured; nobody else has a copy.
	{/if}
</p>

<h2>Who can see it</h2>
<p>
	{#if data.hosted}
		The person running this instance can, technically — it is their database, and an administrator
		can sign in as an account to help with a problem. When that happens the screen says so in a
		banner the whole time, and it is written into your account's history where you can read it
		afterwards. Nobody else has access.
	{:else}
		Whoever administers the machine, which is you.
	{/if}
</p>
<p>There is no analytics, no advertising, no third-party script, and nothing is sold to anyone.</p>

<h2>Who else is involved</h2>
<ul>
	<li>
		<strong>Mail.</strong> Confirmation and password-reset messages go out through an SMTP server this
		instance is configured with. It sees your address and the text of those messages.
	</li>
	<li>
		<strong>Payment.</strong> If you subscribe, {data.provider} handles the transaction as merchant of
		record. They see your billing details; this instance never does, and stores only the identifiers it
		needs to know your subscription is alive.
	</li>
	<li>
		<strong>Plugins.</strong> Anything you connect with an API token sees exactly the scopes you gave
		that token, and nothing else. You can revoke one at any time from Settings → Integrations.
	</li>
</ul>

<h2>Taking it with you, and getting rid of it</h2>
<p>
	Settings → Account exports everything as one JSON file, and deletes the account. Deletion is
	immediate and complete: every row belonging to the account, including its history, in one
	transaction. There is no thirty-day grace period during which it is still there.
</p>
<p>
	Backups are the exception, and the honest caveat: a snapshot taken before you deleted still
	contains what you deleted until it rotates out{#if data.hosted}, which happens within
		{data.backupRetentionDays} days{/if}.
</p>

<h2>Cookies</h2>
<p>
	One, called <code>better-auth.session_token</code>, which is what keeps you signed in. It is not
	shared, not read by anyone else, and there is nothing to consent to because there is nothing else
	being done with it. No tracking cookies means no cookie banner.
</p>

<h2>Asking about any of this</h2>
{#if data.contactEmail}
	<p>
		Write to <a href="mailto:{data.contactEmail}">{data.contactEmail}</a>. It is read by a person.
	</p>
{:else}
	<p>Ask whoever runs this instance.</p>
{/if}
