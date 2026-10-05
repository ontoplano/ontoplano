/**
 * Errors a browser raises that are not the app breaking.
 *
 * `ResizeObserver loop completed with undelivered notifications` is the
 * browser saying an observer's callback changed a size it would have to
 * report again next frame, so it waited a frame. Nothing failed and nothing
 * the person sees is wrong — the specification calls it a notification — yet
 * it arrives as a window `error`, and it was filling "What people sent in"
 * with crashes nobody had.
 *
 * Shared, so the page does not offer to send one and the server does not
 * keep one an older page still sends.
 */
const NOISE = [/^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/];

export function isBrowserNoise(message: string): boolean {
	return NOISE.some((pattern) => pattern.test(message.trim()));
}
