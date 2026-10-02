import 'dotenv/config';
import { createServer } from 'vite';

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
const stagingPool = databaseTarget('STAGING_DATABASE_URL', process.env.STAGING_DATABASE_URL);
const stagingDirect = databaseTarget('STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL);
if (stagingPool.branchHost !== stagingDirect.branchHost) {
	throw new Error('Staging pooled and direct URLs do not identify the same branch.');
}
if (production.branchHost === stagingDirect.branchHost) {
	throw new Error('Staging resolves to the production branch. Refusing to continue.');
}

// Use the pooled endpoint for application-style writes. The direct Neon endpoint is reserved for
// migration tooling and may not be reachable from every local network.
process.env.DATABASE_URL = stagingPool.url;
process.env.DIRECT_URL = stagingDirect.url;
process.env.FASTACCS_LOCAL_DATA_MODE = 'staging';
console.log(`[boosting-drafts] Staging target verified: ${stagingPool.hostname}`);

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
		let result;
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			try {
				result = await prepopulateBoostingDraftSuggestions();
				break;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const retryable =
					/can't reach database|closed the connection|connection.*closed|P1001/i.test(message);
				if (!retryable || attempt === 4) throw error;
				console.warn(`[boosting-drafts] Staging connection dropped; retrying (${attempt}/4).`);
				await prisma.$disconnect();
				await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
			}
		}
		if (!result) throw new Error('Draft population did not return a result.');
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
