import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import type { AutopilotModel } from './settings';
import type { ReplyIntent } from './rules';

/**
 * Optional: Claude reads admin replies the fixed rules couldn't, and may draft a short answer to a
 * question. Claude never decides money: prices it reads go through the same rules as everything
 * else, and its drafts are only sent when they contain no amounts and stay short.
 */

export interface ClaudeReading {
	intent: ReplyIntent;
	priceNgn: number | null;
	draftReply: string | null;
}

export function claudeConfigured(): boolean {
	return Boolean(env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You help a small Nigerian online store, FastAccs (smm.fastaccs.com), book sponsored posts in Telegram channels. FastAccs sells ready social media accounts (mostly X/Twitter, also Instagram, TikTok and Facebook) delivered instantly to the buyer's dashboard.

You read one message from a channel admin and classify it:
- "price": they quoted one clear price for a single post (give it in naira; $ amounts at ₦1,500 per $1).
- "payment_details": they sent bank or payment details.
- "posted": they say the post is live.
- "refuse": they won't run the ad.
- "question": they asked something about us or the ad.
- "unclear": anything else, or several different prices.

Only for "question", draft a short friendly reply (under 300 characters, plain text, no prices, no amounts, no promises about payment, no links). Answer only from the facts above. For every other intent, draft_reply is null.`;

const SCHEMA = {
	type: 'object',
	properties: {
		intent: {
			type: 'string',
			enum: ['price', 'payment_details', 'posted', 'refuse', 'question', 'unclear']
		},
		price_ngn: { type: ['integer', 'null'] },
		draft_reply: { type: ['string', 'null'] }
	},
	required: ['intent', 'price_ngn', 'draft_reply'],
	additionalProperties: false
} as const;

/** A draft is only sent if it is short and carries no amounts or links. */
export function safeDraft(text: string | null): string | null {
	if (!text) return null;
	const trimmed = text.trim();
	if (!trimmed || trimmed.length > 300) return null;
	if (/[₦$#]|\d{3,}|https?:|www\.|t\.me/i.test(trimmed)) return null;
	return trimmed;
}

let client: Anthropic | null = null;

export async function readWithClaude(
	message: string,
	context: { channelTitle: string; model: AutopilotModel }
): Promise<ClaudeReading | null> {
	if (!claudeConfigured()) return null;
	client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 20_000 });
	// Server-side refusal fallback where the model supports it (not on Haiku).
	const fallback =
		context.model === 'claude-opus-5-5'
			? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
			: {};
	try {
		const response = await client.beta.messages.create({
			model: context.model,
			max_tokens: 2048,
			system: SYSTEM,
			output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
			messages: [
				{
					role: 'user',
					content: `Channel: ${context.channelTitle}\nAdmin's message:\n"""${message.slice(0, 2000)}"""`
				}
			],
			...fallback
		});
		if (response.stop_reason === 'refusal') return null;
		const text = response.content.find((block) => block.type === 'text');
		if (!text || text.type !== 'text') return null;
		const parsed = JSON.parse(text.text) as {
			intent: ReplyIntent;
			price_ngn: number | null;
			draft_reply: string | null;
		};
		const price = Number(parsed.price_ngn);
		return {
			intent: parsed.intent,
			priceNgn:
				Number.isFinite(price) && price >= 300 && price <= 1_000_000 ? Math.round(price) : null,
			draftReply: parsed.intent === 'question' ? safeDraft(parsed.draft_reply) : null
		};
	} catch (error) {
		if (error instanceof Anthropic.APIError) {
			console.error(`Autopilot Claude call failed (${error.status}):`, error.message);
			return null;
		}
		if (error instanceof SyntaxError) return null; // malformed JSON: treat as unread
		throw error;
	}
}
