<script lang="ts">
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>Terms · ontoplano</title></svelte:head>

<h1>Terms</h1>
<p class="updated">Last updated {data.updated}.</p>

<p>
	These are the terms for using this instance of ontoplano, run by {data.operator}. Using it means
	agreeing to them. They are short because there is not much to say.
</p>

<h2>The account is yours</h2>
<p>
	What you write here belongs to you. Nothing in these terms gives anyone a licence to use your
	content for anything; it is stored so it can be shown back to you.
</p>
<p>
	Keep your password to yourself, and tell {data.contactEmail} if you think somebody else has it.
</p>

<h2>What you may not do with it</h2>
<ul>
	<li>Store anything illegal where this instance is operated.</li>
	<li>Use it to attack the server it runs on, or anyone else's.</li>
	<li>Resell access to somebody else's account.</li>
</ul>
<p>
	An account doing one of those can be suspended. If that happens you will be told why, and your
	export still works.
</p>

<h2>Paying, if you do</h2>
<p>
	New accounts get {data.trialDays} days of Pro without a card. After that, Pro is a monthly subscription
	handled by Lemon Squeezy as merchant of record — they take the payment, issue the invoice, and handle
	the tax.
</p>
<p>
	Cancel any time; the plan runs to the end of the period you paid for. When it ends the account
	returns to the free plan.
	<strong>Nothing is deleted.</strong> Anything above a free-plan ceiling stays where it is and stays
	readable — you simply cannot add more of that kind until you are back under it or back on Pro.
</p>
<p>
	If a charge was wrong, write to {data.contactEmail} and it will be refunded. That is a promise rather
	than a policy: the sums involved are not worth arguing about.
</p>

<h2>What is promised about it working</h2>
<p>
	{#if data.hosted}
		This is run by one person on ordinary infrastructure. It is not a bank. Expect it to be up
		nearly all the time, expect occasional restarts for updates, and expect no compensation if it is
		down for an afternoon — there is no uptime guarantee here and it would be dishonest to write
		one. What is promised instead is that your data is backed up off the machine, that you can
		export it at any moment without asking, and that if this instance ever shuts down you will be
		told well beforehand with your export still working.
	{:else}
		This is a self-hosted instance: it is up when the machine it runs on is up, which is your
		business rather than anyone else's.
	{/if}
</p>

<h2>Ending it</h2>
<p>
	Delete the account from Settings → Account whenever you like. No notice, no email exchange, no
	retention period.
</p>

<h2>The boring part</h2>
<p>
	The software is provided as it is, without warranty. Liability, where it cannot be excluded, is
	limited to what you paid in the last twelve months. Disputes go to the courts of
	{data.jurisdiction}.
</p>
