import 'dotenv/config';

const source = String(process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS || '').trim();
const productionBuild =
	String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' ||
	String(process.env.REQUIRE_AFFILIATE_PAYOUT_ENCRYPTION || '').toLowerCase() === 'true';

function fail(message) {
	console.error(`[affiliate-encryption] ${message}`);
	process.exit(1);
}

if (!source) {
	if (productionBuild) {
		fail('AFFILIATE_PAYOUT_ENCRYPTION_KEYS is required for a production build.');
	}
	console.log('[affiliate-encryption] No key configured; production enforcement is not active.');
	process.exit(0);
}

const keyIds = new Set();
for (const entry of source.split(',').map((value) => value.trim()).filter(Boolean)) {
	const separator = entry.indexOf(':');
	if (separator <= 0) fail('Keys must use key-id:base64-key entries.');
	const id = entry.slice(0, separator).trim();
	const encoded = entry.slice(separator + 1).trim();
	if (!id || keyIds.has(id)) fail(`Encryption key IDs must be unique (${id || 'blank'}).`);
	const key = Buffer.from(encoded, 'base64');
	if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
		fail(`Encryption key ${id} must be valid base64 that decodes to exactly 32 bytes.`);
	}
	keyIds.add(id);
}

console.log(`[affiliate-encryption] OK: ${keyIds.size} versioned key(s) configured.`);
