import { env } from '$env/dynamic/private';
import { Api, TelegramClient, errors, sessions } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { TelegramSlowDown } from './errors';

/**
 * The autopilot's own Telegram account (the spare SIM), driven through Telegram's official
 * MTProto API. Each cron run connects with the saved login (TELEGRAM_SESSION), does its work and
 * disconnects. Everything the engine needs goes through this small port so it can be tested.
 */

export interface ChannelPost {
	id: number;
	views: number;
	date: Date;
	text: string;
}

export interface FoundChannel {
	username: string;
	title: string;
	id: string;
}

export interface UserbotPort {
	searchChannels(query: string): Promise<FoundChannel[]>;
	channelInfo(
		username: string
	): Promise<{ title: string; about: string; members: number; posts: ChannelPost[] }>;
	recentPosts(username: string, limit?: number): Promise<ChannelPost[]>;
	/** A person we can message: null for bots, channels and unknown handles. */
	resolvePerson(username: string): Promise<{ username: string; userId: string } | null>;
	sendMessage(username: string, text: string): Promise<number>;
	/** Messages the person sent us after `sinceId` (oldest first). */
	incomingFrom(username: string, sinceId: number): Promise<ChannelPost[]>;
	/** People with unread messages to us, by username (one cheap call for the quick reply check). */
	unreadChats(): Promise<Map<string, number>>;
	/** Mark a person's messages as read (they see we've read them). */
	markRead(username: string): Promise<void>;
	/** Telegram's "similar channels" for a channel. */
	similarChannels(username: string): Promise<FoundChannel[]>;
	close(): Promise<void>;
}

export { TelegramSlowDown };

export function userbotConfigured(): boolean {
	return Boolean(env.TELEGRAM_API_ID && env.TELEGRAM_API_HASH && env.TELEGRAM_SESSION);
}

function toPost(message: Api.Message): ChannelPost {
	return {
		id: message.id,
		views: Number(message.views ?? 0),
		date: new Date(Number(message.date ?? 0) * 1000),
		text: message.message ?? ''
	};
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof errors.FloodWaitError) throw new TelegramSlowDown(error.seconds);
		// PEER_FLOOD: Telegram has limited the account for messaging strangers. Back off a day.
		if (error instanceof errors.RPCError && /PEER_FLOOD/.test(error.errorMessage)) {
			throw new TelegramSlowDown(24 * 3600, 'account_limited');
		}
		throw error;
	}
}

export async function connectUserbot(): Promise<UserbotPort> {
	if (!userbotConfigured()) throw new Error('TELEGRAM_NOT_CONFIGURED');
	const client = new TelegramClient(
		new sessions.StringSession(env.TELEGRAM_SESSION),
		Number(env.TELEGRAM_API_ID),
		String(env.TELEGRAM_API_HASH),
		{ connectionRetries: 2 }
	);
	client.setLogLevel(LogLevel.ERROR);
	await client.connect();

	const recentPosts = (username: string, limit = 15) =>
		guard(async () => {
			const messages = await client.getMessages(username, { limit });
			return messages.filter((m): m is Api.Message => m instanceof Api.Message).map(toPost);
		});

	return {
		searchChannels: (query) =>
			guard(async () => {
				const result = await client.invoke(new Api.contacts.Search({ q: query, limit: 20 }));
				return result.chats
					.filter((chat): chat is Api.Channel => chat instanceof Api.Channel)
					.filter((chat) => Boolean(chat.broadcast && chat.username))
					.map((chat) => ({
						username: String(chat.username),
						title: chat.title,
						id: String(chat.id)
					}));
			}),
		channelInfo: (username) =>
			guard(async () => {
				const full = await client.invoke(new Api.channels.GetFullChannel({ channel: username }));
				const info = full.fullChat as Api.ChannelFull;
				const channel = full.chats.find(
					(chat): chat is Api.Channel => chat instanceof Api.Channel && chat.id.equals(info.id)
				);
				if (!channel?.broadcast) throw new Error('NOT_A_CHANNEL'); // a group, not a channel
				return {
					title: channel.title,
					about: info.about ?? '',
					members: Number(info.participantsCount ?? 0),
					posts: await recentPosts(username)
				};
			}),
		recentPosts,
		resolvePerson: (username) =>
			guard(async () => {
				try {
					const entity = await client.getEntity(username);
					if (!(entity instanceof Api.User) || entity.bot || entity.deleted) return null;
					return { username: String(entity.username ?? username), userId: String(entity.id) };
				} catch {
					return null; // unknown or private handle
				}
			}),
		sendMessage: (username, text) =>
			guard(async () => {
				const sent = await client.sendMessage(username, { message: text });
				return sent.id;
			}),
		incomingFrom: (username, sinceId) =>
			guard(async () => {
				const messages = await client.getMessages(username, { limit: 20, minId: sinceId });
				return messages
					.filter((m): m is Api.Message => m instanceof Api.Message && !m.out)
					.map(toPost)
					.sort((a, b) => a.id - b.id);
			}),
		unreadChats: () =>
			guard(async () => {
				const dialogs = await client.getDialogs({ limit: 100 });
				const unread = new Map<string, number>();
				for (const dialog of dialogs) {
					const entity = dialog.entity;
					if (dialog.unreadCount > 0 && entity instanceof Api.User && entity.username) {
						unread.set(entity.username.toLowerCase(), dialog.unreadCount);
					}
				}
				return unread;
			}),
		markRead: (username) =>
			guard(async () => {
				await client.markAsRead(username);
			}),
		similarChannels: (username) =>
			guard(async () => {
				const result = await client.invoke(
					new Api.channels.GetChannelRecommendations({ channel: username })
				);
				return result.chats
					.filter((chat): chat is Api.Channel => chat instanceof Api.Channel)
					.filter((chat) => Boolean(chat.broadcast && chat.username))
					.map((chat) => ({
						username: String(chat.username),
						title: chat.title,
						id: String(chat.id)
					}));
			}),
		close: async () => {
			await client.destroy().catch(() => client.disconnect().catch(() => {}));
		}
	};
}
