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
		phoneInstanceExists,
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

	/*
	 * What each answer actually costs, as a list rather than a paragraph.
	 *
	 * This is the one decision in the app that cannot be undone by pressing
	 * something else later — it decides where a year of somebody's writing
	 * lives — and a wall of prose is how people agree to things they have not
	 * read. One line per difference, in the same order for both, so the two are
	 * read against each other.
	 */
	const CHOICES = {
		connected: {
			label: 'Connect to an instance',
			glyph: 'server' as const,
			says: [
				'The official instance, or one you run yourself.',
				'Your week is on every device you sign in from.',
				'Backed up wherever that instance is backed up.',
				'Assistants reach it over MCP, and plugins work.',
				'Reminders arrive on every device, not just this one.'
			],
			proceed: 'Connect'
		},
		phone: {
			label: 'This phone only',
			glyph: 'phone' as const,
			says: [
				'Everything lives on this phone. Nothing leaves it.',
				'No account, no sign-in, nothing to reach.',
				'Reminders still arrive — this phone schedules them itself.',
				'Nothing is backed up: if the phone goes, so does what is on it.',
				'No assistants over MCP, and no plugins.'
			],
			proceed: 'Start isolated instance'
		}
	} as const;

	/**
	 * Whether this phone has already been an instance.
	 *
	 * It changes what the button promises: "start" is a beginning and "go to"
	 * is a return, and somebody with a month of writing on the device should not
	 * be offered the first when they mean the second. Read once, on mount —
	 * nothing on this screen changes it.
	 */
	const alreadyHere = phoneInstanceExists();

	const chosen = $derived(
		(kind as Kind) === 'phone' && alreadyHere
			? {
					...CHOICES.phone,
					says: ['This phone already has one, with whatever you put in it.', ...CHOICES.phone.says],
					proceed: 'Go to isolated instance'
				}
			: CHOICES[kind]
	);

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

	<!--
		A fixed block whichever is chosen, so choosing moves nothing under it.
		Both lists are the same length for the same reason.
	-->
	<ul class="mt-4 min-h-40 space-y-1 text-sm text-gray-600">
		{#each chosen.says as line (line)}
			<li class="flex gap-2">
				<span class="text-gray-400" aria-hidden="true">—</span>
				<span>{line}</span>
			</li>
		{/each}
	</ul>

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
