/**
 * The modifier this keyboard actually has.
 *
 * `⌘K` printed on a Linux or Windows machine is a symbol for a key that is not
 * there. The hint says what the reader can press.
 *
 * Server-side there is no keyboard to ask about, so it renders `Ctrl` and
 * corrects itself on hydration if it turns out to be a Mac — which is the right
 * way round, because most of them are not.
 */
export function commandKey(): string {
	if (typeof navigator === 'undefined') return 'Ctrl';

	// `||`, not `??`. `navigator.platform` is deprecated, and a deprecated web
	// API is emptied rather than deleted — the browsers that have stopped
	// answering return `''`, which `??` walks straight past. That left an iPhone
	// reading `Ctrl`, which is the one platform this exists to get right.
	const platform =
		(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
		navigator.platform ||
		navigator.userAgent;

	return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
}
