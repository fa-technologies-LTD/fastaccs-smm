import { describe, it, expect } from 'vitest';
import {
	pvapinsAppsForService,
	pvapinsCountryIso,
	findPvapinsCountry,
	serviceByHubId
} from './service-map';
import type { PvapinsApp, PvapinsCountry } from '../pvapins';

const app = (full_name: string, deduct = '0.66'): PvapinsApp => ({
	id: 1,
	full_name,
	deduct,
	trending: 0
});

describe('pvapinsAppsForService', () => {
	it('matches all variants of a service by prefix, case-insensitively', () => {
		const apps = [
			app('Whatsapp24'),
			app('Whatsapp46'),
			app('WHATSAPP-R5'),
			app('Telegram2'),
			app('Anyother15')
		];
		const matched = pvapinsAppsForService(['whatsapp'], apps).map((a) => a.full_name);
		expect(matched).toEqual(['Whatsapp24', 'Whatsapp46', 'WHATSAPP-R5']);
	});
	it('supports multiple prefixes (Google / Gmail)', () => {
		const apps = [app('Google1'), app('Gmail3'), app('Telegram2')];
		expect(pvapinsAppsForService(['google', 'gmail'], apps)).toHaveLength(2);
	});
	it('does not match unrelated apps', () => {
		expect(pvapinsAppsForService(['whatsapp'], [app('Anyother15'), app('Discord2')])).toHaveLength(
			0
		);
	});
	it('requires a service-family boundary for short prefixes', () => {
		const matched = pvapinsAppsForService(
			['imo'],
			[app('Imo'), app('IMO messenger'), app('Imo24'), app('iMoney'), app('Imota')]
		).map((item) => item.full_name);
		expect(matched).toEqual(['Imo', 'IMO messenger', 'Imo24']);
	});
});

describe('pvapinsCountryIso', () => {
	const c = (picture: string): PvapinsCountry => ({ id: 58, full_name: 'USA', picture });
	it('extracts the ISO2 from the picture URL', () => {
		expect(pvapinsCountryIso(c('https://pvapins.com/uploads/images/106321864_us.webp'))).toBe('US');
		expect(pvapinsCountryIso(c('.../95838938_gb.webp'))).toBe('GB');
	});
	it('is empty when there is no code', () => {
		expect(pvapinsCountryIso({ id: 1, full_name: 'X' })).toBe('');
	});
});

describe('findPvapinsCountry', () => {
	const countries: PvapinsCountry[] = [
		{ id: 58, full_name: 'USA', picture: '.../_us.webp' },
		{ id: 165, full_name: 'Canada', picture: '.../_ca.webp' }
	];
	it('matches by ISO code first', () => {
		expect(findPvapinsCountry(countries, 'US')?.id).toBe(58);
	});
	it('falls back to a name match when ISO is missing', () => {
		expect(findPvapinsCountry(countries, '', 'Canada')?.id).toBe(165);
	});
	it('uses stable aliases when pvapins omits its country pictures', () => {
		const withoutPictures: PvapinsCountry[] = [
			{ id: 58, full_name: 'USA', picture: '' },
			{ id: 62, full_name: 'UK', picture: '' }
		];
		expect(findPvapinsCountry(withoutPictures, 'US', 'USA')?.id).toBe(58);
		expect(findPvapinsCountry(withoutPictures, 'GB', 'United Kingdom')?.id).toBe(62);
	});
	it('returns undefined when nothing matches', () => {
		expect(findPvapinsCountry(countries, 'ZZ', 'Nowhere')).toBeUndefined();
	});
});

describe('serviceByHubId', () => {
	it('resolves our canonical service from a hub-man service id', () => {
		expect(serviceByHubId(1)?.name).toBe('WhatsApp');
		expect(serviceByHubId(1)?.pvapinsPrefixes).toContain('whatsapp');
		expect(serviceByHubId(507)?.name).toBe('Signal');
		expect(serviceByHubId(3965)?.name).toBe('Claude AI');
		expect(serviceByHubId(99999)).toBeUndefined();
	});
});
