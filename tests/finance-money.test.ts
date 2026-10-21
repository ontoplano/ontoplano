import { expect, test } from 'vitest';
import { moneyInput, parseSignedMoney } from '../src/lib/money';
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

test('editable signed amounts round-trip at safe integer limits in every currency precision', () => {
	for (const currency of ['KES', 'JPY', 'KWD', null])
		for (const amount of [0, 13262, -13262, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])
			expect(parseSignedMoney(moneyInput(amount, currency), currency)).toBe(amount);
});
