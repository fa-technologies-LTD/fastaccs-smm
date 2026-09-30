/**
 * Scrubbed structural fixtures captured from authenticated read-only responses on 2026-09-10.
 * IDs, names and prices are synthetic; field names and value types mirror the live contracts.
 */
export const SMM_RAJA_SERVICE_FIXTURE = {
	service: '11001',
	serviceID: '11001',
	name: 'Instagram Followers - 30 Days Refill',
	type: 'Default',
	rate: '0.7500',
	min: '100',
	max: '10000',
	dripfeed: true,
	refill: true,
	cancel: false,
	category: 'Instagram Followers',
	description: 'Synthetic fixture'
};

export const BULK_FOLLOWS_SERVICE_FIXTURE = {
	service: 22002,
	name: 'TikTok Video Views',
	type: 'Default',
	rate: '0.0144',
	min: '100',
	max: '1000000',
	dripfeed: false,
	refill: false,
	cancel: true,
	category: 'TikTok Views'
};

export const SMM_RAJA_BALANCE_FIXTURE = { balance: '8.21', currency: 'USD' };
export const BULK_FOLLOWS_BALANCE_FIXTURE = { balance: '21.0069080', currency: 'USD' };
