<script lang="ts">
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<div class="space-y-4">
	{#if data.seatOwner}
		<!--
			A seat grants access, never the ability to spend, so this side has the
			state of the plan and no buttons.
		-->
		<Card title="You are on {data.seatOwner.name}'s plan" accent="var(--section-accent)">
			<p class="text-sm text-gray-600">
				Nothing to pay here. Ask them to take you off it if you would rather pay for yourself.
			</p>
		</Card>
	{:else}
		<Card
			title="Who is on your plan"
			description="Your plan covers {data.seats} accounts — yours and {data.seats - 1} more."
		>
			<p class="text-sm text-gray-600">
				Everybody keeps their own week; the only thing shared is the invoice.
			</p>

			<div class="mt-3"><FormError message={form?.message} /></div>

			{#if form && 'invited' in form && form.invited}
				<div class="mt-3">
					<Banner
						kind="success"
						message="They have been sent an email to open their account and choose a password."
					/>
				</div>
			{:else if form && 'added' in form && form.added}
				<div class="mt-3">
					<Banner kind="success" message="Added — they are on the plan now." />
				</div>
			{/if}

			{#if data.members.length > 0}
				<ul class="mt-3 divide-y divide-gray-200 border-y border-gray-200">
					{#each data.members as member (member.id)}
						<li class="flex items-center justify-between gap-3 py-2">
							<span class="min-w-0">
								<span class="block truncate text-sm text-gray-900">{member.name}</span>
								<span class="block truncate text-xs text-gray-500">{member.email}</span>
							</span>
							<form method="post" action="?/removeSeat" use:enhance>
								<input type="hidden" name="member" value={member.id} />
								<button class="btn btn-sm" title="Take them off this plan">
									<Icon name="close" size={14} />
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.members.length < data.seats - 1}
				<form method="post" action="?/addSeat" use:enhance class="mt-3 flex flex-wrap gap-2">
					<input
						name="who"
						type="email"
						required
						placeholder="their email address"
						class="input flex-1"
					/>
					<button class="btn btn-sm btn-primary">
						<Icon name="plus" size={14} /> Add to my plan
					</button>
				</form>
				<p class="mt-2 text-xs text-gray-500">
					With an account here, they are on the plan at once. Without one, they get an email that
					opens an account already made for them.
				</p>
			{:else}
				<p class="mt-3 text-xs text-gray-500">Every seat is taken.</p>
			{/if}
		</Card>
	{/if}
</div>
