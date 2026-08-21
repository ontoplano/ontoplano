<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	let mode: 'login' | 'register' | 'forgot' = $state('login');
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm border border-gray-200 bg-white p-8 shadow-sm">
		<h1 class="mb-6 text-xl font-bold tracking-tight text-gray-900">ontoplano</h1>

		{#if form?.message}
			<div class="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{form.message}
			</div>
		{/if}

		{#if form?.success && form.action === 'requestReset'}
			<div class="mb-4 border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
				{form.message}
			</div>
		{/if}

		<form
			method="post"
			action={mode === 'login' ? '?/signIn' : mode === 'register' ? '?/signUp' : '?/requestReset'}
			use:enhance
		>
			{#if mode === 'register'}
				<label class="mb-3 block">
					<span class="text-sm font-medium text-gray-700">Name</span>
					<input
						name="name"
						type="text"
						required
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			{/if}
			<label class="mb-3 block">
				<span class="text-sm font-medium text-gray-700">Email</span>
				<input
					name="email"
					type="email"
					required
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			{#if mode !== 'forgot'}
				<label class="mb-4 block">
					<span class="text-sm font-medium text-gray-700">Password</span>
					<input
						name="password"
						type="password"
						required
						minlength="3"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			{/if}
			<button
				type="submit"
				class="w-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
			</button>
		</form>

		<p class="mt-4 text-center text-sm text-gray-500">
			{#if mode === 'login'}
				No account?
				<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'register')}>
					Register
				</button>
				&middot;
				<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'forgot')}>
					Forgot password
				</button>
			{:else}
				Have an account?
				<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'login')}>
					Sign in
				</button>
			{/if}
		</p>

		{#if mode === 'forgot' && !data.emailConfigured}
			<p class="mt-3 text-center text-xs text-gray-400">
				This server has no mail configured, so the link will be written to its log rather than sent.
			</p>
		{/if}
	</div>
</div>
