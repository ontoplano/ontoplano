import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SYSTEMD_USER_DIR = join(homedir(), '.config', 'systemd', 'user');

export interface TimerInfo {
	lastTrigger: string;
	nextElapse: string;
}

export interface ServiceInfo {
	name: string;
	description: string;
	activeState: string;
	subState: string;
	mainPID: number;
	activeEnterTimestamp: string;
	uptime: string;
	hasTimer: boolean;
	timer: TimerInfo | null;
	logs: string[];
}

function listUnitFiles(suffix: string): string[] {
	try {
		return readdirSync(SYSTEMD_USER_DIR)
			.filter((f) => f.endsWith(suffix))
			.map((f) => f.slice(0, -suffix.length));
	} catch {
		return [];
	}
}

function run(command: string, args: string[]): string {
	try {
		return execFileSync(command, args, { encoding: 'utf-8', timeout: 5000 }).trim();
	} catch {
		return '';
	}
}

function parseShowOutput(output: string): Record<string, string>[] {
	return output
		.split('\n\n')
		.map((block) => {
			const props: Record<string, string> = {};
			for (const line of block.split('\n')) {
				const eq = line.indexOf('=');
				if (eq > 0) {
					props[line.slice(0, eq)] = line.slice(eq + 1);
				}
			}
			return props;
		})
		.filter((p) => Object.keys(p).length > 0);
}

function parseTimestamp(ts: string): Date | null {
	if (!ts) return null;
	// systemd format: "Thu 2026-04-16 19:52:17 -03"
	// JS needs -0300 instead of -03
	const fixed = ts.replace(/([+-]\d{2})$/, '$100');
	const d = new Date(fixed);
	return isNaN(d.getTime()) ? null : d;
}

function formatDuration(ms: number): string {
	if (ms < 0) return '';
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

function getUptime(timestamp: string): string {
	const date = parseTimestamp(timestamp);
	if (!date) return '';
	return formatDuration(Date.now() - date.getTime());
}

function getLogs(serviceName: string, lines: number): string[] {
	const output = run('journalctl', [
		'--user',
		'-u',
		`${serviceName}.service`,
		'-n',
		String(lines),
		'--no-pager',
		'--output=short'
	]);
	return output ? output.split('\n') : [];
}

export function getServices(): ServiceInfo[] {
	const serviceNames = listUnitFiles('.service');
	const timerNames = new Set(listUnitFiles('.timer'));

	if (serviceNames.length === 0) return [];

	const PROPS = [
		'Id',
		'Description',
		'ActiveState',
		'SubState',
		'MainPID',
		'ActiveEnterTimestamp'
	];

	const showOutput = run('systemctl', [
		'--user',
		'show',
		...serviceNames.map((n) => `${n}.service`),
		`--property=${PROPS.join(',')}`
	]);

	const blocks = parseShowOutput(showOutput);

	const timerBlocks = new Map<string, Record<string, string>>();
	const timerList = serviceNames.filter((n) => timerNames.has(n));
	if (timerList.length > 0) {
		const timerOutput = run('systemctl', [
			'--user',
			'show',
			...timerList.map((n) => `${n}.timer`),
			'--property=Id,LastTriggerUSec,NextElapseUSecRealtime'
		]);
		for (const block of parseShowOutput(timerOutput)) {
			const id = (block['Id'] || '').replace('.timer', '');
			timerBlocks.set(id, block);
		}
	}

	return blocks
		.map((props) => {
			const name = (props['Id'] || '').replace('.service', '');
			const hasTimer = timerNames.has(name);
			const timerProps = timerBlocks.get(name);

			return {
				name,
				description: props['Description'] || '',
				activeState: props['ActiveState'] || 'unknown',
				subState: props['SubState'] || 'unknown',
				mainPID: parseInt(props['MainPID'] || '0', 10),
				activeEnterTimestamp: props['ActiveEnterTimestamp'] || '',
				uptime:
					props['ActiveState'] === 'active'
						? getUptime(props['ActiveEnterTimestamp'] || '')
						: '',
				hasTimer,
				timer:
					hasTimer && timerProps
						? {
								lastTrigger: timerProps['LastTriggerUSec'] || '',
								nextElapse: timerProps['NextElapseUSecRealtime'] || ''
							}
						: null,
				logs: getLogs(name, 20)
			};
		})
		.sort((a, b) => {
			const order: Record<string, number> = {
				active: 0,
				activating: 1,
				failed: 2,
				inactive: 3
			};
			const aOrder = order[a.activeState] ?? 4;
			const bOrder = order[b.activeState] ?? 4;
			if (aOrder !== bOrder) return aOrder - bOrder;
			return a.name.localeCompare(b.name);
		});
}

export function isAllowedService(name: string): boolean {
	return listUnitFiles('.service').includes(name);
}

export function controlService(
	name: string,
	action: 'restart' | 'stop' | 'start'
): { ok: boolean; error?: string } {
	if (!isAllowedService(name)) return { ok: false, error: 'Service not in allowlist' };
	try {
		execFileSync('systemctl', ['--user', action, `${name}.service`], {
			encoding: 'utf-8',
			timeout: 15000
		});
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
