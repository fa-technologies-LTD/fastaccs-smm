import { describe, expect, it } from 'vitest';
import { parsePhoneSmsResponse } from './hubman';
import { hasDeliveredSms, resolveOtp } from './phone-fulfillment';

// The exact shape hub-man returns for a DELIVERED TikTok code (captured live from the API).
// The `data` is a non-empty ARRAY — the case the old code wrongly treated as "still waiting",
// which refunded every successful rental. These tests lock that it's now detected.
const DELIVERED_TIKTOK = {
	data: [
		{
			id: 4294415,
			phone_number: 13252445343,
			sender_name: '+18663402233',
			message: '[#][TikTok] 038502 is your verification code\nfJpzQvK2eu1',
			otp: '038502',
			classification_service_id: 50,
			classification_service_name: 'TikTok/Douyin',
			received_at: '2026-08-01T21:43:03+00:00'
		}
	]
};

describe('parsePhoneSmsResponse (hub-man /sms payload)', () => {
	it('returns the SMS from a non-empty array (delivered code — the money-leak fix)', () => {
		const sms = parsePhoneSmsResponse(DELIVERED_TIKTOK.data);
		expect(sms).not.toBeNull();
		expect(sms?.otp).toBe('038502');
	});
	it('returns null for an empty array (genuinely still waiting)', () => {
		expect(parsePhoneSmsResponse([])).toBeNull();
	});
	it('returns the SMS from a bare object', () => {
		expect(parsePhoneSmsResponse({ otp: '123456', message: 'x' })?.otp).toBe('123456');
	});
	it('returns null for null / non-object data', () => {
		expect(parsePhoneSmsResponse(null)).toBeNull();
		expect(parsePhoneSmsResponse(undefined)).toBeNull();
		expect(parsePhoneSmsResponse('waiting')).toBeNull();
	});
});

describe('hasDeliveredSms (gates every refund — a delivered SMS must never be refunded)', () => {
	it('is true when hub-man parsed an OTP', () => {
		expect(hasDeliveredSms({ otp: '038502', message: '' } as never)).toBe(true);
	});
	it('is true when a message arrived even without a parsed OTP', () => {
		expect(hasDeliveredSms({ otp: '', message: 'Your code is 4821' } as never)).toBe(true);
	});
	it('is false when both OTP and message are empty (truly waiting)', () => {
		expect(hasDeliveredSms({ otp: '', message: '' } as never)).toBe(false);
		expect(hasDeliveredSms({ otp: '   ', message: '  ' } as never)).toBe(false);
	});
	it('is false for null', () => {
		expect(hasDeliveredSms(null)).toBe(false);
	});
});

describe('resolveOtp (the code shown to the customer)', () => {
	it('uses hub-man’s parsed OTP when present', () => {
		expect(resolveOtp({ otp: '038502', message: 'anything' } as never)).toBe('038502');
	});
	it('extracts the code from the message when hub-man did not parse one', () => {
		expect(
			resolveOtp({ otp: '', message: '[#][TikTok] 560299 is your verification code' } as never)
		).toBe('560299');
	});
	it('returns empty string when there is nothing to extract', () => {
		expect(resolveOtp({ otp: '', message: 'no digits here' } as never)).toBe('');
	});
});
