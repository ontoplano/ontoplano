<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { isIsolatedBuild } from '$lib/isolated/mode';
	import {
		ARRIVING_AT,
		ARRIVING_HOME,
		OFFICIAL_INSTANCE,
		chooseOnThisPhone,
		inPhoneApp,
		rememberInstance,
		storedInstance,
		suggestedInstance
	} from '$lib/instance-choice';

	/*
	 * Where your ontoplano lives.
	 *
	 * The app can be two different things and the difference is not a setting
	 * buried in preferences — it decides whether there is a server at all. So
	 * it is a screen, and it is the screen you land on when you leave an
	 * instance: two squares, the same shape the subscription page uses for the
	 * same reason, and a paragraph under them that changes as you choose.
	 *
	 * The connected one starts selected, because it is what almost everybody
	 * wants and because the other one is a decision about backups that nobody
	 * should make by accident.
	 */
	type Kind = 'connected' | 'phone';
	let kind: Kind = $state('connected');
	/*
	 * The address to edit is the one you are on.
	 *
	 * The commonest reason to open this screen is that the laptop moved: the
	 * app is pointed at 192.168.1.10 and the wifi now says .23. Prefilling
	 * with what it is currently showing makes that two keystrokes; prefilling
	 * with the official address would make it a retype.
	 */
	let address = $state(startingAddress());

	function startingAddress(): string {
		const stored = storedInstance();
		if (stored) return stored;
		if (typeof location === 'undefined') return OFFICIAL_INSTANCE;
		// The app's own files are served from a local origin; that is not an
		// instance somebody types.
		return /^https?:/.test(location.origin) &&
			!/localhost|127\.0\.0\.1|^file:/.test(location.origin)
			? location.origin
			: OFFICIAL_INSTANCE;
	}

	/*
	 * A build that suggests an address fills the field with it.
	 *
	 * This is the whole of what makes the DEV app the DEV app: it carries the
	 * same copy of ontoplano as every other build and opens this screen with
	 * the laptop's address already typed. Asked for after the field already has
	 * something in it, so the screen is usable in the frame before the answer
	 * arrives, and never allowed to overwrite an address the person is editing.
	 */
	let untouched = $state(true);

	/*
	 * Arriving with the answer already given.
	 *
	 * A page on somebody else's origin cannot choose this phone — its storage is
	 * not this origin's — so leaving an instance means being sent here with the
	 * answer in the address. Recorded and acted on immediately: nobody asked to
	 * be asked twice.
	 */
	$effect(() => {
		const carried = new URLSearchParams(location.search);
		if (carried.has(ARRIVING_HOME)) {
			rememberInstance(null);
			location.replace('/');
			return;
		}
		const instance = carried.get(ARRIVING_AT);
		if (instance) {
			rememberInstance(instance);
			location.replace(instance);
		}
	});

	$effect(() => {
		if (storedInstance()) return;
		let alive = true;
		suggestedInstance().then((suggested) => {
			if (alive && untouched && suggested) address = suggested;
		});
		return () => {
			alive = false;
		};
	});

	const CHOICES = {
		connected: {
			label: 'Connect to an instance',
			glyph: 'server' as const,
			says:
				'The official instance, or one you run yourself on a server or a computer at home. ' +
				'Your week is on every device you sign in from, assistants can reach it over MCP, ' +
				'plugins work, and a reminder arrives while the phone is in your pocket.',
			proceed: 'Connect'
		},
		phone: {
			label: 'This phone only',
			glyph: 'phone' as const,
			says:
				'Everything lives on this phone and nothing leaves it — no account, no sign-in, ' +
				'nothing to reach. Which also means nothing is backed up: if the phone goes, so ' +
				'does what is on it, unless you export it yourself. No assistants over MCP, no ' +
				'plugins, and nothing arrives while you are not looking.',
			proceed: 'Keep it on this phone'
		}
	} as const;

	const chosen = $derived(CHOICES[kind]);

	/**
	 * Whether this phone can be the instance.
	 *
	 * Either this page is already the copy the phone carries, or it is a page
	 * from somewhere else being drawn inside the app — which carries that copy
	 * one navigation away. A desktop browser is neither, and there the phone
	 * square is something to know about rather than something to press.
	 */
	const canRunHere = $derived(isIsolatedBuild() || inPhoneApp());

	function go() {
		const url = kind === 'phone' ? null : address.trim().replace(/\/+$/, '');
		if (url !== null && !/^https?:\/\/.+/.test(url)) return;

		/*
		 * A page an instance served cannot answer this question itself.
		 *
		 * Storage belongs to an origin, and the app reads its answer out of the
		 * origin its own copy is served from — so from anywhere else the answer
		 * travels as an address and is recorded on arrival. In a browser there is
		 * nowhere to arrive at and the choice is simply where to go.
		 */
		if (inPhoneApp() && !isIsolatedBuild()) {
			location.href = chooseOnThisPhone(url);
			return;
		}
		rememberInstance(url);
		location.href = url || '/';
	}
</script>

<svelte:head><title>Where your ontoplano lives</title></svelte:head>

<div class="mx-auto w-full max-w-xl px-4 py-8">
	<h1 class="text-2xl font-bold tracking-tight text-gray-900">Where your ontoplano lives</h1>
	<p class="mt-1 text-sm text-gray-500">You can change this later.</p>

	<!--
		Two squares, side by side, and choosing one moves nothing on the page:
		the border width is constant and the paragraph under them is a fixed
		block whichever is chosen.
	-->
	<div class="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Where it lives">
		{#each ['connected', 'phone'] as const as option (option)}
			<button
				type="button"
				role="radio"
				aria-checked={kind === option}
				onclick={() => (kind = option)}
				class="flex aspect-square flex-col items-center justify-center gap-2 border-2 px-3 text-center transition {kind ===
				option
					? 'border-gray-900 bg-gray-50'
					: 'border-gray-200 hover:border-gray-400'}"
			>
				<span class={kind === option ? 'text-gray-900' : 'text-gray-400'}>
					<Icon name={CHOICES[option].glyph} size={44} />
				</span>
				<span class="text-base font-bold text-gray-900">{CHOICES[option].label}</span>
			</button>
		{/each}
	</div>

	<p class="mt-4 min-h-24 text-sm text-gray-600">{chosen.says}</p>

	{#if kind === 'connected'}
		<label class="mt-2 block text-sm">
			<span class="text-gray-600">Its address</span>
			<OneLine
				name="instance"
				bind:value={address}
				oninput={() => (untouched = false)}
				class="input mt-1 w-full"
				placeholder={OFFICIAL_INSTANCE}
			/>
			<span class="mt-1 block text-xs text-gray-500">
				Your phone's back gesture brings you back here.
			</span>
		</label>
	{:else if !canRunHere}
		<p class="mt-2 text-sm text-amber-800">
			This copy of the app cannot hold an instance itself — the one that can is the app built for
			it.
		</p>
	{/if}

	<button
		class="btn btn-primary mt-5 w-full"
		type="button"
		disabled={kind === 'phone' && !canRunHere}
		onclick={go}
	>
		{chosen.proceed}
	</button>
</div>
