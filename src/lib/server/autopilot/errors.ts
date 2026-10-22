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
