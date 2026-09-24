/**
 * A block's rhythm, said in the reader's language.
 *
 * The sentence used to be assembled from English literals and an English list
 * of weekdays, so a Portuguese plan read "Every Thursday".
 */
import { describe, expect, test } from 'vitest';
import { describeRecurrence, parseRecurrence } from '../src/lib/recurrence';
import { translator } from '../src/lib/i18n/core';
import { messages as english } from '../src/lib/i18n/catalogues/en';
import { messages as portuguese } from '../src/lib/i18n/catalogues/pt-BR';

const en = translator('en', english);
const pt = translator('pt-BR', portuguese);
const THURSDAY = 3;

const say = (raw: string, t = en) => describeRecurrence(parseRecurrence(raw), THURSDAY, t);

describe('describeRecurrence', () => {
	test('in English', () => {
		expect(say('weekly')).toBe('Every Thursday');
		expect(say('weekdays:0,2,4')).toBe('Every Monday, Wednesday, and Friday');
		expect(say('weekdays:0,1,2,3,4,5,6')).toBe('Every day');
		expect(say('weeks:2:2026-09-24')).toBe('Every other Thursday');
		expect(say('weeks:3:2026-09-24')).toBe('Every 3 weeks on Thursday');
		expect(say('days:1:2026-09-24')).toBe('Every day');
		expect(say('days:4:2026-09-24')).toBe('Every 4 days');
		expect(say('monthly:5')).toBe('Day 5 of each month');
	});

	test('in Portuguese, weekday names and list included', () => {
		expect(say('weekly', pt)).toBe('Toda semana: Quinta-feira');
		expect(say('weekdays:0,2', pt)).toBe('Toda semana: Segunda-feira e Quarta-feira');
		expect(say('weekdays:0,1,2,3,4,5,6', pt)).toBe('Todo dia');
		expect(say('weeks:2:2026-09-24', pt)).toBe('A cada duas semanas: Quinta-feira');
		expect(say('weeks:3:2026-09-24', pt)).toBe('A cada 3 semanas: Quinta-feira');
		expect(say('days:1:2026-09-24', pt)).toBe('Todo dia');
		expect(say('days:4:2026-09-24', pt)).toBe('A cada 4 dias');
		expect(say('monthly:5', pt)).toBe('Dia 5 de cada mês');
	});
});
