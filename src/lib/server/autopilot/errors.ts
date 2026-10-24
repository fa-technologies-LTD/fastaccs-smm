/** Telegram asked us to slow down (or limited the account): stop this run and try later. */
export class TelegramSlowDown extends Error {
	constructor(
		public seconds: number,
		public reason: 'flood_wait' | 'account_limited' = 'flood_wait'
	) {
		super(
			reason === 'account_limited'
				? 'Telegram has limited messages from this account'
				: `Telegram asked to wait ${seconds}s`
		);
	}
}

/** We can't post in this group (banned, read-only, private, or no links/text allowed). */
export class GroupBlocked extends Error {
	constructor(public reason: string) {
		super(`Group blocked: ${reason}`);
	}
}

/** The group has slow mode on: wait before posting again. */
export class GroupSlowmode extends Error {
	constructor(public seconds: number) {
		super(`Group slow mode: wait ${seconds}s`);
	}
}
