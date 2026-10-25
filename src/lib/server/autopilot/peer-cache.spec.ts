import { describe, expect, it } from 'vitest';
import { Api, sessions } from 'telegram';

/**
 * The autopilot saves looked-up usernames and puts them back into the Telegram session at the
 * start of each run (userbot.ts). This checks the library really answers from those saved rows,
 * so no network lookup (which Telegram strictly limits) is needed.
 */
describe('saved Telegram lookups', () => {
	it('a saved [id, access key, username] row is used instead of a network lookup', async () => {
		const session = new sessions.StringSession('');
		const rows = (session as unknown as { _entities: Set<unknown[]> })._entities;
		rows.add(['-1001234567890', '987654321987654321', 'naija_hub', undefined, 'naija_hub']);
		rows.add(['555666777', '123456789', 'promo_boss', undefined, 'promo_boss']);

		const channel = await session.getInputEntity('naija_hub');
		expect(channel).toBeInstanceOf(Api.InputPeerChannel);
		expect(String((channel as Api.InputPeerChannel).channelId)).toBe('1234567890');
		expect(String((channel as Api.InputPeerChannel).accessHash)).toBe('987654321987654321');

		const user = await session.getInputEntity('@Promo_Boss');
		expect(user).toBeInstanceOf(Api.InputPeerUser);
		expect(String((user as Api.InputPeerUser).userId)).toBe('555666777');
	});
});
