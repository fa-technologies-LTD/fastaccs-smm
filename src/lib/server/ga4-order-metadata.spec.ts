import { describe, expect, it } from 'vitest';
import {
	captureGa4OrderMetadata,
	ga4PurchaseReporter,
	normalizeGa4OrderClientId,
	usesManagedGa4Ecommerce
} from './ga4-order-metadata';

describe('consented versioned order analytics', () => {
	it('versions only explicitly consented, valid new captures', () => {
		const metadata = captureGa4OrderMetadata({ ga4ClientId: ' 123.456 ', consentGranted: true });
		expect(metadata).toMatchObject({
			ga4ClientId: '123.456',
			ga4ConsentGranted: true,
			ga4EcommerceVersion: 2,
			source: 'checkout'
		});
		expect(ga4PurchaseReporter({ analyticsMetadata: metadata })).toBe('server');
	});
	it.each([false, undefined, 'true', 1])(
		'does not infer consent from a cookie when consent is %s',
		(consentGranted) => {
			expect(captureGa4OrderMetadata({ ga4ClientId: '123.456', consentGranted })).toEqual({});
		}
	);
	it.each(['invalid', '', '1'.repeat(101) + '.1', 'person@example.com', null])(
		'rejects invalid client id %s',
		(ga4ClientId) => {
			expect(normalizeGa4OrderClientId(ga4ClientId)).toBeNull();
			expect(captureGa4OrderMetadata({ ga4ClientId, consentGranted: true })).toEqual({});
		}
	);
	it('does not upgrade or claim ownership of old browser-tracked orders', () => {
		const old = { ga4ClientId: '123.456', ga4ServerPurchaseVerifiedSentAt: 'old' };
		expect(usesManagedGa4Ecommerce(old)).toBe(false);
		expect(ga4PurchaseReporter({ analyticsMetadata: old })).toBe('browser');
	});
	it('keeps browser purchase reporting when the server transport is not configured', () => {
		const metadata = captureGa4OrderMetadata(
			{ ga4ClientId: '123.456', consentGranted: true },
			false
		);
		expect(metadata.ga4EcommerceVersion).toBe(1);
		expect(metadata.ga4ConsentGranted).toBe(true);
		expect(ga4PurchaseReporter({ analyticsMetadata: metadata })).toBe('browser');
		expect(usesManagedGa4Ecommerce(metadata)).toBe(false);
	});
});
