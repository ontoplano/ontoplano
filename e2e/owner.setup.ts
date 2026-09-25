import { test } from '@playwright/test';
import { register, testEmail } from './helpers/account';

// The separate administration runner needs an owner before it can sign in.
// Complete onboarding too, so protected pages do not redirect to /welcome.
test('create the test instance owner', async ({ page }) => {
	await register(page, testEmail('owner'), 'Test owner');
});
