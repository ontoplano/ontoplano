/**
 * Who may create an account, and which answer wins.
 *
 * Three sources disagree by design — an explicit environment variable, the
 * staging flag, and the config file the web page writes — and the order matters
 * more than any of them individually. Getting it backwards means either an
 * instance that cannot be opened without logging into it, or one that quietly
 * stays open after the flag is removed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let registrationMode: typeof import('../src/lib/server/services/registration').registrationMode;
let setRegistrationMode: typeof import('../src/lib/server/services/registration').setRegistrationMode;

beforeAll(async () => {
	const mod = await import('../src/lib/server/services/registration');
	registrationMode = mod.registrationMode;
	setRegistrationMode = mod.setRegistrationMode;
	setRegistrationMode('closed');
});

afterEach(() => {
	delete process.env.ONTOPLANO_STAGING;
	delete process.env.ONTOPLANO_REGISTRATION;
});

describe('registrationMode', () => {
	test('falls back to the config file', () => {
		setRegistrationMode('invite');
		expect(registrationMode()).toBe('invite');
		setRegistrationMode('closed');
		expect(registrationMode()).toBe('closed');
	});

	/**
	 * Staging is a label, and a label changes nothing.
	 *
	 * It used to return `open` on its own, which made the one instance people
	 * are invited to try the one instance running a code path production never
	 * runs — the opposite of what a staging instance is for. Whatever staging
	 * should do differently is written in its env file, in the same variable
	 * production uses to say the opposite.
	 */
	test('staging changes nothing about who may register', () => {
		for (const mode of ['closed', 'invite', 'open'] as const) {
			setRegistrationMode(mode);
			delete process.env.ONTOPLANO_STAGING;
			const production = registrationMode();

			process.env.ONTOPLANO_STAGING = 'true';
			expect(registrationMode(), `the config file says ${mode}`).toBe(production);
		}
	});

	test('a staging box that wants sign-ups says so out loud', () => {
		setRegistrationMode('closed');
		process.env.ONTOPLANO_STAGING = 'true';
		process.env.ONTOPLANO_REGISTRATION = 'open';
		expect(registrationMode()).toBe('open');
	});

	test('an explicit setting beats the config file', () => {
		setRegistrationMode('closed');
		process.env.ONTOPLANO_REGISTRATION = 'open';
		expect(registrationMode()).toBe('open');
	});

	test('nonsense in the environment is ignored rather than obeyed', () => {
		// The dangerous direction is a typo reading as "open".
		setRegistrationMode('closed');
		process.env.ONTOPLANO_REGISTRATION = 'opne';
		expect(registrationMode()).toBe('closed');
	});
});
