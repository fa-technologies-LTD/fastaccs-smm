#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KNOWN_PREFIX_RE =
	/^(?:2fa(?:\s*code)?|backup(?:\s*code)?|login\s*link|link|url)\s*[:=-]?\s*/i;
const ABSOLUTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DOMAIN_HINT_RE = /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i;

function trimString(value) {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function compact(value) {
	return value.replace(/\s+/g, '');
}

function stripKnownPrefix(value) {
	return value.replace(KNOWN_PREFIX_RE, '').trim();
}

function fixCommonSchemeTypos(value) {
	let normalized = value;
	normalized = normalized.replace(/^https:\/\/https\/\/+/i, 'https://');
	normalized = normalized.replace(/^https:\/\/http\/\/+/i, 'https://');
	normalized = normalized.replace(/^http:\/\/https\/\/+/i, 'http://');
	normalized = normalized.replace(/^http:\/\/http\/\/+/i, 'http://');
	normalized = normalized.replace(/^https\/\/+/i, 'https://');
	normalized = normalized.replace(/^http\/\/+/i, 'http://');
	normalized = normalized.replace(/^https:\/(?!\/)/i, 'https://');
	normalized = normalized.replace(/^http:\/(?!\/)/i, 'http://');
	return normalized;
}

function coerceHttpUrl(value) {
	let candidate = compact(value);
	if (!candidate) return null;

	candidate = fixCommonSchemeTypos(candidate);

	if (candidate.startsWith('//')) {
		candidate = `https:${candidate}`;
	}

	if (/^www\./i.test(candidate)) {
		candidate = `https://${candidate}`;
	}

	if (!ABSOLUTE_SCHEME_RE.test(candidate) && DOMAIN_HINT_RE.test(candidate)) {
		candidate = `https://${candidate}`;
	}

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

function sanitizeStoredCredentialValue(value) {
	const raw = trimString(value);
	if (!raw) return null;

	const candidate = stripKnownPrefix(raw);
	const href = coerceHttpUrl(candidate);
	return href || raw;
}

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const records = await prisma.account.findMany({
		where: {
			OR: [{ twoFa: { not: null } }, { linkUrl: { not: null } }]
		},
		select: {
			id: true,
			twoFa: true,
			linkUrl: true
		}
	});

	let changedCount = 0;

	for (const account of records) {
		const nextTwoFa = sanitizeStoredCredentialValue(account.twoFa);
		const nextLinkUrl = sanitizeStoredCredentialValue(account.linkUrl);

		if (nextTwoFa === account.twoFa && nextLinkUrl === account.linkUrl) {
			continue;
		}

		changedCount += 1;

		if (!dryRun) {
			await prisma.account.update({
				where: { id: account.id },
				data: {
					twoFa: nextTwoFa,
					linkUrl: nextLinkUrl
				}
			});
		}
	}

	console.log(
		`[normalize-credential-links] scanned=${records.length} changed=${changedCount} dryRun=${dryRun}`
	);
}

main()
	.catch((error) => {
		console.error('[normalize-credential-links] failed', error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
