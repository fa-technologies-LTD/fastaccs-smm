import { Prisma } from '@prisma/client';
import { expect, it, vi } from 'vitest';
vi.mock('$lib/prisma', () => ({ prisma: {} }));
import { updateNumbersCatalogSnapshot } from './numbers-catalog-snapshot';

it('matches the original JSON snapshot before any catalogue overwrite', async () => {
	const update = vi.fn().mockResolvedValue({});
	expect(
		await updateNumbersCatalogSnapshot(
			'tier',
			{ price_locked: false },
			{ price_locked: false, stock: 4 },
			{ category: { update } } as never
		)
	).toBe(true);
	expect(update).toHaveBeenCalledWith({
		where: { id: 'tier', metadata: { equals: { price_locked: false } } },
		data: { metadata: { price_locked: false, stock: 4 } }
	});
});
it('skips a stale catalogue write after a manual lock wins the race', async () => {
	const update = vi
		.fn()
		.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError('No match', { code: 'P2025', clientVersion: '6' })
		);
	expect(
		await updateNumbersCatalogSnapshot('tier', { price_locked: false }, { price_locked: false }, {
			category: { update }
		} as never)
	).toBe(false);
});
it('does not hide unrelated database failures', async () => {
	const update = vi.fn().mockRejectedValue(new Error('Database unavailable'));
	await expect(
		updateNumbersCatalogSnapshot('tier', null, {}, { category: { update } } as never)
	).rejects.toThrow('Database unavailable');
});
