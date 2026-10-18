import { expect, test } from 'vitest';
import { parseSignedMoney } from '../src/lib/money';
test('ledger forms retain sign and exact original-currency precision', () => {
	expect(parseSignedMoney('132.62', 'KES')).toBe(13262);
	expect(parseSignedMoney('-132,62', 'KES')).toBe(-13262);
	expect(parseSignedMoney('-50', 'JPY')).toBe(-50);
	expect(parseSignedMoney('1.234', 'KWD')).toBe(1234);
	expect(parseSignedMoney('13262', null)).toBe(13262);
	for (const input of ['oops', '12abc', '1.001', '9007199254740992'])
		expect(parseSignedMoney(input, 'KES')).toBeNull();
	expect(parseSignedMoney('1.2', null)).toBeNull();
});
