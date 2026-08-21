/**
 * A small in-memory rate limiter for the endpoints worth protecting.
 *
 * In-memory on purpose: this app is one node process with a SQLite file beside
 * it, so a shared store would be infrastructure without a reader. The trade is
 * stated plainly — limits reset when the process restarts, and a multi-process
 * deployment would need something shared. Neither is true today.
 *
 * The window is a fixed bucket rather than a sliding log: an attacker can send
 * 2N requests across a boundary, which for sign-in throttling is a difference
 * that does not matter, and it costs one integer per key instead of a list.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so a long-running process does not accumulate keys. */
function sweep(now: number) {
	if (buckets.size < 1000) return;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	sweep(now);

	const existing = buckets.get(key);
	if (!existing || existing.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, retryAfterSeconds: 0 };
	}

	existing.count++;
	if (existing.count > limit) {
		return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
	}

	return { allowed: true, retryAfterSeconds: 0 };
}

/** Only used by tests and by a successful sign-in clearing its own attempts. */
export function resetRateLimit(key: string): void {
	buckets.delete(key);
}

/**
 * Best-effort client address.
 *
 * Behind a reverse proxy the socket address is the proxy, so the forwarded
 * header is used when the deployment says it is behind one. That is opt-in:
 * trusting `x-forwarded-for` unconditionally lets anyone forge their identity
 * and sidestep every limit here.
 */
export function clientKey(request: Request, getClientAddress: () => string): string {
	if (process.env.ONTOPLANO_TRUST_PROXY === 'true') {
		const forwarded = request.headers.get('x-forwarded-for');
		if (forwarded) return forwarded.split(',')[0].trim();
	}
	try {
		return getClientAddress();
	} catch {
		return 'unknown';
	}
}
