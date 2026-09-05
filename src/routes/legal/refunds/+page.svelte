<script lang="ts">
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>Refunds · ontoplano</title></svelte:head>

<h1>Refunds</h1>
<p class="updated">Last updated {data.updated}.</p>

{#if !data.hosted}
	<!--
		A self-hosted copy sells nothing, so it has nothing to refund. Saying so
		is better than a page of policy about payments that never happen — and
		better than a 404, because the footer links here from every instance.
	-->
	<p>
		This instance is somebody's own copy of ontoplano. It takes no payments, so there is nothing
		here to refund.
	</p>
{:else}
	<p>
		Short version: you get {data.trialDays} days free before anything is charged, you can cancel at any
		moment, and if you were charged for something you did not want, you are refunded.
	</p>

	<h2>Before the first charge</h2>
	<p>
		A new account runs for {data.trialDays} days without paying{data.trialRequiresCard
			? '. A card is asked for at the start so the subscription can begin when the trial ends, and nothing is taken until it does'
			: ' and no card is asked for'}. Cancelling in those days costs nothing, because nothing has
		been charged.
	</p>

	<h2>The seven days after a payment</h2>
	<p>
		Brazilian consumer law — the Código de Defesa do Consumidor, article 49 — gives anyone who buys
		something away from a shop seven days from the purchase to change their mind and be refunded in
		full, without giving a reason. That applies here, and it is honoured whether or not the account
		was used in the meantime.
	</p>
	<p>
		Ask within seven days of the charge and the whole amount goes back to the card it came from.
	</p>

	<h2>After that</h2>
	<p>
		Cancel whenever you like: the subscription stops renewing and the account keeps working until
		the end of the period already paid for. That part is not refunded pro rata, because it is time
		you can still use.
	</p>
	<p>
		Two exceptions, honoured without argument: a charge you did not intend — a renewal you meant to
		cancel, a second subscription bought by mistake — and a period in which the service was
		unusable. Write and it is refunded.
	</p>

	<h2>How to ask</h2>
	<p>
		Write to {data.contactEmail ?? 'whoever runs this instance'}, from the address on the account,
		and say which charge. There is no form.
	</p>
	{#if data.provider}
		<p>
			Payment is handled by {data.provider} as merchant of record: they take the payment and issue the
			invoice, so the refund is made through them and lands back on the same card.
		</p>
	{/if}

	<h2>What a refund does to the account</h2>
	<p>
		<strong>Nothing is deleted.</strong> A refunded or ended subscription leaves everything you wrote
		where it is, readable and exportable in one click. You simply cannot add more until you subscribe
		again — and because the source is open, you can run your own copy instead and take the export with
		you.
	</p>
{/if}
