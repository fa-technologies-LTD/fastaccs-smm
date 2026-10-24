import { describe, expect, it } from 'vitest';
import { buyRequest, groupCopy, groupQualifies, readGroupRules } from './group-rules';

describe('spotting people asking to buy', () => {
	it.each([
		['Who sells Twitter accounts here?', 'X (Twitter)', 'x'],
		['pls I need an old twitter account urgently', 'X (Twitter)', 'x'],
		['Anyone selling X accounts with followers?', 'X (Twitter)', 'x'],
		['who get instagram account for sale abeg', null, null],
		['Need IG account, who has?', 'Instagram', 'Instagram'],
		['where can I buy tiktok accounts', 'TikTok', 'tiktok'],
		['I need gmail accounts in bulk', 'Gmail and email', 'mails']
	])('%s', (text, name, slug) => {
		const found = buyRequest(text);
		expect(found?.name ?? null).toBe(name);
		expect(found?.slug ?? null).toBe(slug);
	});

	it('ignores sellers, unrelated chat and the letter x on its own', () => {
		expect(buyRequest('Twitter accounts available now, DM to buy')).toBeNull();
		expect(buyRequest('I sell IG accounts ₦5,000')).toBeNull();
		expect(buyRequest("I'm selling twitter accounts, who needs?")).toBeNull();
		expect(buyRequest('who is coming to the x meetup')).toBeNull();
		expect(buyRequest('Where can I buy airtime?')).toBeNull();
	});
});

describe('group rules', () => {
	it('never posts where links or ads are banned; promos only where invited', () => {
		expect(readGroupRules('Crypto chat', 'Rules: no links, no ads. Be respectful.')).toEqual({
			linksBanned: true,
			adsAllowed: false
		});
		expect(readGroupRules('Naija buy and sell. Post your business here!', '')).toEqual({
			linksBanned: false,
			adsAllowed: true
		});
		expect(readGroupRules('Naija hustle chat', '')).toEqual({
			linksBanned: false,
			adsAllowed: false
		});
	});

	it('joins active Nigerian groups with a real crowd; owner picks only need links allowed', () => {
		const now = new Date('2026-10-24T12:00:00Z');
		const messages = Array.from({ length: 20 }, (_, i) => ({
			date: new Date(now.getTime() - i * 30 * 60_000),
			text: i % 3 ? 'gm' : 'Naija hustle no dey stop'
		}));
		const group = { title: 'Hustle Hub', about: '', members: 2_000, pinned: '', messages };
		expect(groupQualifies(group, now).ok).toBe(true);
		expect(groupQualifies({ ...group, members: 100 }, now).reason).toBe('small group');
		expect(groupQualifies({ ...group, messages: messages.slice(0, 3) }, now).reason).toBe(
			'quiet group'
		);
		expect(groupQualifies({ ...group, pinned: 'No links allowed' }, now).reason).toBe(
			'no links allowed'
		);
		expect(groupQualifies({ ...group, members: 100 }, now, { ownerPick: true }).ok).toBe(true);
	});
});

describe('group wording', () => {
	it('hides long tracking links behind short labels, safely escaped', () => {
		const promo = groupCopy.promo(
			'https://smm.fastaccs.com/?utm_source=telegram&utm_content=a',
			'https://smm.fastaccs.com/affiliate'
		);
		expect(promo).toContain(
			'<a href="https://smm.fastaccs.com/?utm_source=telegram&amp;utm_content=a">Shop now at smm.fastaccs.com</a>'
		);
		expect(promo).not.toMatch(/>https?:/); // no raw URL shown as text
	});
});
