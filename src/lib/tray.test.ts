import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearTray } from './tray';

describe('clearTray', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('closes every notification the worker has in the tray', async () => {
		const shown = [{ close: vi.fn() }, { close: vi.fn() }];
		vi.stubGlobal('navigator', {
			serviceWorker: {
				getRegistration: async () => ({ getNotifications: async () => shown })
			}
		});
		await clearTray();
		for (const one of shown) expect(one.close).toHaveBeenCalledOnce();
	});

	test('does nothing, quietly, where there is no worker or no tray', async () => {
		vi.stubGlobal('navigator', {});
		await expect(clearTray()).resolves.toBeUndefined();
		vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined } });
		await expect(clearTray()).resolves.toBeUndefined();
		vi.stubGlobal('navigator', {
			serviceWorker: {
				getRegistration: async () => {
					throw new Error('no');
				}
			}
		});
		await expect(clearTray()).resolves.toBeUndefined();
	});
});
