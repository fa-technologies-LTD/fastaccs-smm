import { describe, it, expect } from 'vitest';
import { parsePvapinsSms, usdStringToCents } from './pvapins';

describe('parsePvapinsSms (leak-safe: "received" iff a code is present)', () => {
	it('treats the verified waiting string as waiting', () => {
		expect(parsePvapinsSms('You have not received any code yet.')).toEqual({ status: 'waiting' });
	});

	it('treats empty / whitespace as waiting', () => {
		expect(parsePvapinsSms('')).toEqual({ status: 'waiting' });
		expect(parsePvapinsSms('   ')).toEqual({ status: 'waiting' });
	});

	it('detects a code from a JSON array shape (documented from/message/timestamp)', () => {
		const raw = JSON.stringify([
			{ from: '+18663402233', message: 'Your code is 483920', timestamp: '2026-08-04 00:00:00' }
		]);
		const r = parsePvapinsSms(raw);
		expect(r).toMatchObject({ status: 'received', otp: '483920' });
	});

	it('handles the EXACT documented received shape (from/message/timestamp, code embedded mid-sentence)', () => {
		const raw = JSON.stringify([
			{
				from: '22000',
				message: 'If someone requests this code, it is a scam. Use code 418494 to verify.',
				timestamp: '17/08/2025 08:15 pm'
			}
		]);
		const r = parsePvapinsSms(raw);
		expect(r).toMatchObject({ status: 'received', otp: '418494', from: '22000' });
	});

	it('detects a code from a JSON object shape', () => {
		const r = parsePvapinsSms(JSON.stringify({ message: '[TikTok] 038502 is your verification code' }));
		expect(r).toMatchObject({ status: 'received', otp: '038502' });
	});

	it('detects a code from a BARE string (guards against the hub-man array bug class)', () => {
		const r = parsePvapinsSms('Your WhatsApp code is 771234');
		expect(r).toMatchObject({ status: 'received', otp: '771234' });
	});

	it('surfaces a balance-expired error rather than settling or refunding blindly', () => {
		expect(parsePvapinsSms('Your balance is expired').status).toBe('error');
	});

	it('treats an unknown, code-LESS shape as waiting (never a false receive)', () => {
		expect(parsePvapinsSms('processing, please hold')).toEqual({ status: 'waiting' });
	});
});

describe('usdStringToCents', () => {
	it('normalizes pvapins USD dollar strings to hub-man-style cents', () => {
		expect(usdStringToCents('0.66')).toBe(66);
		expect(usdStringToCents('1.00')).toBe(100);
		expect(usdStringToCents('8.60')).toBe(860);
	});
	it('is safe on junk', () => {
		expect(usdStringToCents('')).toBe(0);
		expect(usdStringToCents(undefined)).toBe(0);
		expect(usdStringToCents('abc')).toBe(0);
	});
});
