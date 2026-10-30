import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	privateReceiptDownloadUrl,
	receiptFromMetadata,
	signCloudinaryParams
} from './payout-receipts';

afterEach(() => vi.unstubAllEnvs());

describe('payout receipts', () => {
	it('signs requests the way Cloudinary documents', () => {
		expect(
			signCloudinaryParams(
				{
					timestamp: '1315060510',
					public_id: 'sample_image',
					eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop'
				},
				'abcd'
			)
		).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
	});

	it('reads only a complete receipt reference from payout metadata', () => {
		expect(
			receiptFromMetadata({ receipt: { publicId: 'payout-receipts/a', format: 'jpg' } })
		).toMatchObject({
			publicId: 'payout-receipts/a',
			format: 'jpg'
		});
		expect(receiptFromMetadata({ receipt: { uploadedAt: '2026-10-30' } })).toBeNull();
		expect(receiptFromMetadata({})).toBeNull();
	});

	it('downloads the private image through a short-lived signed link', () => {
		vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo');
		vi.stubEnv('CLOUDINARY_API_KEY', 'key');
		vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
		const url = new URL(
			privateReceiptDownloadUrl(
				{
					publicId: 'payout-receipts/a',
					format: 'jpg',
					bytes: 1,
					uploadedAt: '',
					uploadedBy: null
				},
				1_800_000_000_000
			)!
		);
		expect(url.pathname).toBe('/v1_1/demo/image/download');
		expect(url.searchParams.get('type')).toBe('authenticated');
		expect(url.searchParams.get('expires_at')).toBe('1800000300');
		expect(url.searchParams.get('signature')).toBe(
			signCloudinaryParams(
				{
					expires_at: '1800000300',
					format: 'jpg',
					public_id: 'payout-receipts/a',
					timestamp: '1800000000',
					type: 'authenticated'
				},
				'secret'
			)
		);
	});
});
