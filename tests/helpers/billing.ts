import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Whether this checkout has a payment provider compiled into it.
 *
 * Read off the filesystem rather than by importing the resolver, deliberately.
 * Importing `billing/index` pulls the provider module in at the top of a test
 * file — before `vi.mock` is applied and before the test's own database exists —
 * and what that breaks is not the billing tests but the mocks of everything the
 * provider happens to import. A directory listing answers the same question and
 * loads nothing.
 *
 * Tests about the provider's own behaviour skip when it is absent: they are
 * about code this repository does not ship. See
 * `src/lib/server/billing/contract.ts`.
 */
const PROVIDERS = join(process.cwd(), 'src', 'lib', 'server', 'billing', 'providers');

export function hasBillingProvider(): boolean {
	if (!existsSync(PROVIDERS)) return false;
	return readdirSync(PROVIDERS).some((file) => file.endsWith('.ts'));
}
