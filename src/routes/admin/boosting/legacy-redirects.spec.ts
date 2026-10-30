import { describe, expect, it } from 'vitest';
import { load as oldMappings } from '../boosting-mappings/+page.server';
import { load as oldPricing } from '../boosting-pricing/+page.server';
import { load as oldServices } from '../boosting-services/+page.server';

function expectCanonicalRedirect(load: (event: never) => unknown, path: string) {
	try {
		load({ url: new URL(`https://smm.fastaccs.com${path}?platform=x`) } as never);
		throw new Error('Expected redirect');
	} catch (error) {
		expect(error).toMatchObject({ status: 308, location: '/admin/boosting?platform=x' });
	}
}

describe('legacy Boosting admin routes', () => {
	it('send every old entry point to the one combined workspace', () => {
		expectCanonicalRedirect(oldServices as (event: never) => unknown, '/admin/boosting-services');
		expectCanonicalRedirect(oldPricing as (event: never) => unknown, '/admin/boosting-pricing');
		expectCanonicalRedirect(oldMappings as (event: never) => unknown, '/admin/boosting-mappings');
	});
});
