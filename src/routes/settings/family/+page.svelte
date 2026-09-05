<script lang="ts">
	import { enhance } from '$app/forms';
	import { armed } from '$lib/actions/armed';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/** Which member's removal is waiting for its second, deliberate press. */
	let confirmRemove = $state<string | null>(null);
</script>

<div class="space-y-4">
	{#if data.seatOwner}
		<!--
			A seat grants access, never the ability to spend, so this side has the
			state of the plan and no buttons.
		-->
		<!-- The title is the whole message. -->
		<Card title="You are on {data.seatOwner.name}'s plan" accent="var(--section-accent)" />
	{:else}
		<Card
			title="Who is on your plan"
			description="Your plan covers {data.seats} accounts — yours and {data.seats - 1} more."
		>
			<p class="text-sm text-gray-600">Everybody keeps their own week; you just pay for it.</p>

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
					<Banner
						kind="success"
						message="Asked — the seat is theirs when they accept. They have an email about it."
					/>
				</div>
			{:else if form && 'withdrawn' in form && form.withdrawn}
				<div class="mt-3"><Banner kind="success" message="The offer is withdrawn." /></div>
			{/if}

			{#if data.members.length > 0}
				<ul class="mt-3 divide-y divide-gray-200 border-y border-gray-200">
					{#each data.members as member (member.id)}
						<li class="flex items-center justify-between gap-3 py-2">
							<span class="min-w-0">
								<span class="block truncate text-sm text-gray-900">{member.name}</span>
								<span class="block truncate text-xs text-gray-500">{member.email}</span>
							</span>
							{#if confirmRemove === member.id}
								<!-- Two presses, and the second is not under the cursor: taking
								     a seat away locks a person out of writing until somebody
								     pays, which one slipped click must never do. -->
								<form
									method="post"
									action="?/removeSeat"
									use:enhance={() =>
										async ({ update }) => {
											confirmRemove = null;
											await update();
										}}
									class="flex shrink-0 items-center gap-1"
								>
									<input type="hidden" name="member" value={member.id} />
									<button type="button" onclick={() => (confirmRemove = null)} class="btn btn-sm">
										Keep them
									</button>
									<button class="btn btn-danger btn-sm" use:armed>Take them off the plan</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => (confirmRemove = member.id)}
									class="btn btn-sm"
									title="Take them off this plan"
								>
									<Icon name="close" size={14} />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.invited.length > 0}
				<!--
					Offers, not members. An account that already existed is asked
					rather than moved, so these sit apart from the seats that are
					actually in use — and each one can be taken back.
				-->
				<p class="eyebrow mt-4 text-gray-500">Waiting for an answer</p>
				<ul class="mt-1 divide-y divide-gray-200 border-y border-gray-200">
					{#each data.invited as person (person.id)}
						<li class="flex items-center justify-between gap-3 py-2">
							<span class="min-w-0">
								<span class="block truncate text-sm text-gray-900">{person.email}</span>
								<span class="block truncate text-xs text-gray-500">
									asked — the seat is held until they answer
								</span>
							</span>
							<form method="post" action="?/withdrawInvite" use:enhance class="shrink-0">
								<input type="hidden" name="member" value={person.id} />
								<button class="btn btn-sm">Withdraw</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.members.length + data.invited.length < data.seats - 1}
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
					With an account here, they are asked first and the seat is theirs once they accept.
					Without one, they get an email that opens an account already made for them.
				</p>
			{:else}
				<p class="mt-3 text-xs text-gray-500">Every seat is taken.</p>
			{/if}
		</Card>
	{/if}
</div>
