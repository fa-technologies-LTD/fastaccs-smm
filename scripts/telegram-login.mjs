#!/usr/bin/env node
/**
 * One-time login for the Telegram autopilot account.
 *
 * Run it yourself in your own Terminal (not through an assistant):
 *   node scripts/telegram-login.mjs
 *
 * It asks for your api_id and api_hash (from my.telegram.org), the account's phone number, the
 * login code Telegram sends you, and your 2-step password if you set one. It then prints a long
 * session text: paste that into Vercel as TELEGRAM_SESSION. Anyone holding it can use the
 * account, so keep it as secret as a password. Nothing is saved to disk.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import telegram from 'telegram';
import loggerModule from 'telegram/extensions/Logger.js';

const { TelegramClient, sessions } = telegram;
const { LogLevel } = loggerModule;

const rl = createInterface({ input: stdin, output: stdout });
// Answers are queued line by line (no readline/promises), so this runs on older Node versions
// and nothing is lost if several lines are pasted at once.
const queued = [];
const waiting = [];
rl.on('line', (line) => {
	const next = waiting.shift();
	if (next) next(line.trim());
	else queued.push(line.trim());
});
const ask = (question) => {
	stdout.write(question);
	return queued.length
		? Promise.resolve(queued.shift())
		: new Promise((resolve) => waiting.push(resolve));
};

const apiId = Number(process.env.TELEGRAM_API_ID || (await ask('api_id (numbers only): ')));
const apiHash = process.env.TELEGRAM_API_HASH || (await ask('api_hash: '));
if (!Number.isInteger(apiId) || apiId <= 0 || !/^[0-9a-f]{32}$/i.test(apiHash)) {
	console.error(
		'That api_id or api_hash does not look right. Copy them again from my.telegram.org.'
	);
	process.exit(1);
}

const client = new TelegramClient(new sessions.StringSession(''), apiId, apiHash, {
	connectionRetries: 3
});
client.setLogLevel(LogLevel.ERROR);

try {
	await client.start({
		phoneNumber: () => ask('Phone number of the autopilot account (with +234): '),
		phoneCode: () => ask('Code Telegram just sent you: '),
		password: () => ask('2-step verification password (press Enter if none): '),
		onError: (error) => console.error('Telegram said:', error.message)
	});
	const me = await client.getMe();
	console.log(`\nLogged in as @${me.username ?? me.firstName}.`);
	console.log('\nCopy everything on the next line into Vercel as TELEGRAM_SESSION:\n');
	console.log(client.session.save());
	console.log('\nThen close this window. Do not share that text with anyone.');
} finally {
	rl.close();
	await client.disconnect();
	process.exit(0);
}
