import { describe, it, expect } from 'vitest';
import {
	getProvider,
	allProviders,
	resolveOtpFromText,
	encodePvapinsRef,
	decodePvapinsRef
} from './index';

describe('provider registry', () => {
	it('exposes hub-man and pvapins with the correct billing models', () => {
		expect(getProvider('hubman').id).toBe('hubman');
		expect(getProvider('hubman').billing).toBe('pay-on-success');
		expect(getProvider('pvapins').id).toBe('pvapins');
		expect(getProvider('pvapins').billing).toBe('pay-on-success');
		expect(allProviders()).toHaveLength(2);
	});
});

describe('pvapins providerRef codec (round-trips number|country|app)', () => {
	it('encodes and decodes cleanly', () => {
		const ref = encodePvapinsRef('13865902416', 'USA', 'Whatsapp24');
		expect(decodePvapinsRef(ref)).toEqual({
			number: '13865902416',
			country: 'USA',
			app: 'Whatsapp24'
		});
	});
});

describe('resolveOtpFromText', () => {
	it('prefers a provider-parsed OTP', () => {
		expect(resolveOtpFromText('483920', 'Your code is 111111')).toBe('483920');
	});
	it('falls back to the first 4–8 digit run in the message', () => {
		expect(resolveOtpFromText('', 'Use code 418494 to verify')).toBe('418494');
	});
	it('extracts a hyphen-split code like WhatsApp "852-570" (real live shape)', () => {
		expect(resolveOtpFromText('', '852-570')).toBe('852570');
		expect(resolveOtpFromText(null, 'Your code: 852 570')).toBe('852570');
	});
	it('returns empty when there is no code', () => {
		expect(resolveOtpFromText(null, 'no digits here')).toBe('');
	});
});
