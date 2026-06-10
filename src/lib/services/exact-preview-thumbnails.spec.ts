import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	account: {
		findMany: vi.fn(),
		update: vi.fn()
	}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

import { generateMissingExactPreviewThumbnails } from './exact-preview-thumbnails';

describe('exact-preview thumbnail backlog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CLOUDINARY_CLOUD_NAME = 'fastaccs';
		process.env.CLOUDINARY_API_KEY = 'key';
		process.env.CLOUDINARY_API_SECRET = 'secret';
		prismaMock.account.findMany.mockResolvedValue([]);
	});

	it('scans the oldest untouched accounts first with a bounded backlog window', async () => {
		const result = await generateMissingExactPreviewThumbnails({ limit: 6 });

		expect(result.scanned).toBe(0);
		expect(prismaMock.account.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
				take: 300
			})
		);
	});
});
