import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	updateUser: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { update: mocks.updateUser }
	}
}));

vi.mock('./admin-settings', () => ({
	getSitePopupsEnabledSetting: vi.fn(async () => true)
}));

import { markSitePopupSeen } from './site-popups';

describe('product refresh popup tracking', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.updateUser.mockResolvedValue({});
	});

	it.each([
		['numbers_improved', 'numbersImprovedPopupSeenAt'],
		['boosting_refresh', 'boostingRefreshPopupSeenAt']
	] as const)('stores %s independently', async (type, field) => {
		await markSitePopupSeen('user-1', type);

		expect(mocks.updateUser).toHaveBeenCalledWith({
			where: { id: 'user-1' },
			data: { [field]: expect.any(Date) }
		});
	});
});
