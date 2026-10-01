import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';
import { createServer } from 'vite';

setDefaultResultOrder('ipv4first');

function databaseTarget(name, value) {
	if (!value?.trim()) throw new Error(`${name} is not configured.`);
	const url = new URL(value.trim());
	if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
		throw new Error(`${name} must be a PostgreSQL URL.`);
	}
	return {
		url: value.trim(),
		hostname: url.hostname.toLowerCase(),
		branchHost: url.hostname.toLowerCase().replace('-pooler.', '.')
	};
}

const production = databaseTarget('DIRECT_URL', process.env.DIRECT_URL);
const staging = databaseTarget('STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL);
if (production.branchHost === staging.branchHost) {
	throw new Error('Staging resolves to the production branch. Refusing to continue.');
}

process.env.DATABASE_URL = staging.url;
process.env.DIRECT_URL = staging.url;
process.env.FASTACCS_LOCAL_DATA_MODE = 'staging';
console.log(`[boosting-drafts] Staging target verified: ${staging.hostname}`);

const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
try {
	const [{ prepopulateBoostingDraftSuggestions }, { prisma }] = await Promise.all([
		vite.ssrLoadModule('/src/lib/server/boosting-providers/draft-suggestions.ts'),
		vite.ssrLoadModule('/src/lib/prisma.ts')
	]);
	try {
		const result = await prepopulateBoostingDraftSuggestions();
		console.log(
			JSON.stringify(
				{
					actionSafety: ['hidden_offers', 'unapproved_shadow_routes', 'staging_database_write'],
					result
				},
				null,
				2
			)
		);
	} finally {
		await prisma.$disconnect();
	}
} finally {
	await vite.close();
}
