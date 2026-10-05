import { describe, expect, it } from 'vitest';
import { actionName, receiptFor, speechFor, type FormAnswer } from './form-answers';

const answer = (over: Partial<FormAnswer>): FormAnswer => ({
	action: 'archive',
	outcome: 'success',
	message: null,
	refused: false,
	answered: false,
	fromDialog: false,
	quiet: false,
	...over
});

describe('actionName', () => {
	it('reads the named action off the URL', () => {
		expect(actionName(new URL('http://x/shopping?/archiveLedger'))).toBe('archiveLedger');
		expect(actionName(new URL('http://x/shopping?/delete&x=1'))).toBe('delete');
	});
	it('is null for a default action', () => {
		expect(actionName(new URL('http://x/shopping'))).toBeNull();
	});
});

describe('receiptFor', () => {
	it('answers by the first word of the action', () => {
		expect(receiptFor('archiveLedger')).toBe('toast.archived');
		expect(receiptFor('createTodo')).toBe('toast.added');
		expect(receiptFor('setTheme')).toBe('toast.saved');
		expect(receiptFor('renameFolder')).toBe('toast.renamed');
		expect(receiptFor('delete')).toBe('toast.deleted');
	});
	it('says nothing for a verb it does not know', () => {
		expect(receiptFor('signIn')).toBeNull();
		expect(receiptFor('checkout')).toBeNull();
		expect(receiptFor(null)).toBeNull();
	});
});

describe('speechFor', () => {
	it('gives a receipt for a success', () => {
		expect(speechFor(answer({}))).toEqual({ kind: 'receipt', key: 'toast.archived' });
	});
	it('prefers what the action said back', () => {
		expect(speechFor(answer({ message: 'Signed out.' }))).toEqual({
			kind: 'receipt',
			text: 'Signed out.'
		});
	});
	it('says a refusal, with or without words', () => {
		expect(speechFor(answer({ outcome: 'failure', message: 'Name is required.' }))).toEqual({
			kind: 'refusal',
			text: 'Name is required.'
		});
		expect(speechFor(answer({ outcome: 'error' }))).toEqual({ kind: 'refusal', text: '' });
	});
	it('stays quiet where something else already spoke, or was asked to', () => {
		expect(speechFor(answer({ answered: true }))).toBeNull();
		expect(speechFor(answer({ fromDialog: true }))).toBeNull();
		expect(speechFor(answer({ quiet: true }))).toBeNull();
		expect(speechFor(answer({ outcome: 'failure', refused: true }))).toBeNull();
		expect(speechFor(answer({ outcome: 'redirect' }))).toBeNull();
	});
});
