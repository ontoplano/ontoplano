import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { instanceSells } from './billing.js';
import { isEmailConfigured } from '../email.js';

/**
 * The processes an instance needs BESIDE the app, and whether they exist.
 *
 * `ontoplano.service` is not the whole deployment: reminders fire from a
 * systemd timer that asks `/api/jobs/reminders` once a minute, the weekly
 * review mail from another, billing reconciliation from a third. A
 * self-hoster who set up the service alone has an app that works perfectly
 * and never reminds them of anything — and nothing anywhere said so. This is
 * what the instance page reads to say so.
 *
 * Two authorities, in order of honesty:
 *
 *  - For reminders, the app itself: the endpoint stamps every call, so "last
 *    asked 40 seconds ago" is true whatever is doing the asking — systemd,
 *    cron, or a curl in a loop.
 *  - For the rest, systemd: `is-active`, asked of the user manager and then
 *    the system one, because the deb installs system units and the by-hand
 *    setup installs user units. Reading state needs no privileges.
 */

/** Set by the job endpoints as they run; empty since the last app restart. */
const lastRun = new Map<string, number>();

export function markJobRan(job: string): void {
	lastRun.set(job, Date.now());
}

export function lastRanAt(job: string): number | null {
	return lastRun.get(job) ?? null;
}

type UnitState = 'active' | 'inactive' | 'not-found' | 'unknown';

function ask(args: string[]): Promise<string> {
	return new Promise((resolve) => {
		execFile('systemctl', args, { timeout: 4000 }, (error, stdout) => {
			// `is-active` exits non-zero for anything but active, with the state
			// on stdout either way — the error is not a failure to answer.
			resolve(String(stdout ?? '').trim() || (error ? 'unknown' : ''));
		});
	});
}

async function unitState(unit: string): Promise<UnitState> {
	for (const flavour of [['--user'], []]) {
		const said = await ask([...flavour, 'is-active', unit]);
		if (said === 'active' || said === 'activating') return 'active';
		if (said === 'inactive' || said === 'failed' || said === 'deactivating') {
			// Inactive can mean "between ticks" for a timer's service, or "no
			// such unit" on some systemd versions — tell them apart.
			const loaded = await ask([...flavour, 'is-enabled', unit]);
			if (loaded === 'unknown' || loaded === 'not-found' || loaded === '') continue;
			return 'inactive';
		}
	}
	return 'not-found';
}

export type Companion = {
	label: string;
	unit: string;
	ok: boolean;
	/** One sentence of state, already worded. */
	detail: string;
	/** The command that fixes a bad row; empty when ok. */
	fix: string;
};

const MINUTE = 60_000;

/**
 * The command that fixes a missing unit, said for the install that is here.
 *
 * A package ships system units under /usr/lib/systemd/system; the from-source
 * install puts user units in ~/.config/systemd/user. Telling a .deb operator
 * to run `systemctl --user` fixes nothing, so look before speaking.
 */
function enableCommand(unit: string, verb: 'enable --now' | 'restart'): string {
	return existsSync(`/usr/lib/systemd/system/${unit}`)
		? `sudo systemctl ${verb} ${unit}`
		: `systemctl --user ${verb} ${unit}`;
}

/**
 * The rows the instance page shows. Async and shelling out, so it is called
 * from that one page's load and nowhere hot.
 */
export async function companions(): Promise<Companion[]> {
	const rows: Companion[] = [];

	// Reminders: the app's own record outranks systemd.
	const asked = lastRanAt('reminders');
	if (asked !== null) {
		const minutes = Math.round((Date.now() - asked) / MINUTE);
		const fresh = Date.now() - asked < 5 * MINUTE;
		rows.push({
			label: 'Reminders',
			unit: 'ontoplano-reminders.timer',
			ok: fresh,
			detail: fresh
				? `running — last asked this app ${minutes <= 1 ? 'a minute' : `${minutes} minutes`} ago`
				: `stopped asking — last heard from ${minutes} minutes ago`,
			fix: fresh ? '' : enableCommand('ontoplano-reminders.timer', 'restart')
		});
	} else {
		const state = await unitState('ontoplano-reminders.timer');
		rows.push({
			label: 'Reminders',
			unit: 'ontoplano-reminders.timer',
			ok: state === 'active',
			detail:
				state === 'active'
					? 'timer running; nothing has come due since the app started'
					: 'nothing is asking this app to deliver reminders, so none go out',
			fix: state === 'active' ? '' : enableCommand('ontoplano-reminders.timer', 'enable --now')
		});
	}

	// The weekly review mail: stamped by its job endpoint, like reminders, so a
	// container's own scheduler counts the same as a systemd timer. The window
	// is generous because the timer is hourly, not minutely.
	//
	// Without SMTP it has nothing to send with, and that is a fact about the
	// instance rather than a fault — the timer costs a clock read, and most
	// self-hosted boxes never configure mail. Saying "installed and running"
	// over a transport that cannot exist reads as working, which is the lie
	// this card exists to prevent — so that case is its own quiet row.
	const mailReady = isEmailConfigured();
	const askedReview = lastRanAt('weekly-reviews');
	if (!mailReady) {
		rows.push({
			label: 'Weekly review mail',
			unit: 'ontoplano-weekly-review.timer',
			ok: true,
			detail: 'needs SMTP to send — none is configured, so nothing goes out',
			fix: ''
		});
	} else if (askedReview !== null) {
		const minutes = Math.round((Date.now() - askedReview) / MINUTE);
		const fresh = Date.now() - askedReview < 3 * 60 * MINUTE;
		rows.push({
			label: 'Weekly review mail',
			unit: 'ontoplano-weekly-review.timer',
			ok: fresh,
			detail: fresh
				? `running — last asked this app ${minutes <= 1 ? 'a minute' : `${minutes} minutes`} ago`
				: `stopped asking — last heard from ${minutes} minutes ago`,
			fix: fresh ? '' : enableCommand('ontoplano-weekly-review.timer', 'restart')
		});
	}

	const timers: [string, string][] = [
		...(mailReady && askedReview === null
			? [['Weekly review mail', 'ontoplano-weekly-review.timer'] as [string, string]]
			: []),
		...(instanceSells()
			? [['Billing reconciliation', 'ontoplano-reconcile.timer'] as [string, string]]
			: []),
		['Backups', 'ontoplano-backup.timer']
	];
	for (const [label, unit] of timers) {
		const state = await unitState(unit);
		rows.push({
			label,
			unit,
			ok: state === 'active',
			detail:
				state === 'active'
					? 'timer running'
					: state === 'inactive'
						? 'installed but not running'
						: 'not installed on this machine',
			fix: state === 'active' ? '' : enableCommand(unit, 'enable --now')
		});
	}

	return rows;
}
