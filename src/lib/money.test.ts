import { describe, expect, test } from 'vitest';
import { formatMoney, parseMoney } from './money';

describe('reading a price somebody typed', () => {
	test('a comma is a decimal separator, because it is here', () => {
		expect(parseMoney('39,90', 'BRL')).toBe(3990);
	});

	test('so is a full stop', () => {
		expect(parseMoney('39.90', 'BRL')).toBe(3990);
	});

	test('a thousands separator is not part of the number', () => {
		expect(parseMoney('1.299,90', 'BRL')).toBe(129990);
	});

	test('currency symbols and spaces are ignored', () => {
		expect(parseMoney('R$ 12,00', 'BRL')).toBe(1200);
	});

	test('nothing typed is not a price of zero', () => {
		expect(parseMoney('', 'BRL')).toBeNull();
		expect(parseMoney(null, 'BRL')).toBeNull();
		expect(parseMoney('   ', 'BRL')).toBeNull();
	});

	test('a negative price is refused rather than stored', () => {
		expect(parseMoney('-5', 'BRL')).toBeNull();
	});

	test('a currency with no minor unit counts whole', () => {
		expect(parseMoney('1200', 'JPY')).toBe(1200);
	});
});

describe('showing it again', () => {
	test('what goes in comes out', () => {
		const cents = parseMoney('12,34', 'BRL');
		expect(formatMoney(cents!, 'BRL', 'pt-BR')).toContain('12,34');
	});

	test('yen has no decimals', () => {
		expect(formatMoney(1200, 'JPY', 'en-GB')).not.toContain('.');
	});
});
