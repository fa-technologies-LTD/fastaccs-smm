import 'dotenv/config';

function target(name, value) {
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

try {
	if (!process.argv.includes('--confirm')) {
		throw new Error('Pass --confirm to remove only unapproved generated staging routes.');
	}
	const production = target('DIRECT_URL', process.env.DIRECT_URL);
	const staging = target('STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL);
	if (production.branchHost === staging.branchHost) {
		throw new Error('Staging resolves to production. Refusing to continue.');
	}
	process.env.DATABASE_URL = staging.url;
	process.env.DIRECT_URL = staging.url;
	const { PrismaClient } = await import('@prisma/client');
	const database = new PrismaClient();
	try {
		const where = {
			state: 'shadow',
			equivalenceApproved: false,
			equivalenceLabel: 'Automatically suggested; owner review required'
		};
		const count = await database.boostServiceRoute.count({ where });
		const linked = await database.boostCustomerOffer.count({
			where: { OR: [{ preferredRoute: { is: where } }, { lockedRoute: { is: where } }] }
		});
		if (linked) throw new Error(`${linked} generated routes are linked as preferred/locked; refusing cleanup.`);
		const result = await database.boostServiceRoute.deleteMany({ where });
		console.log(
			JSON.stringify({
				target: staging.hostname,
				matched: count,
				removed: result.count,
				paidSupplierOrdersPlaced: 0
			})
		);
	} finally {
		await database.$disconnect();
	}
} catch (error) {
	console.error(`[boosting-route-reset] ${error instanceof Error ? error.message : 'Failed.'}`);
	process.exitCode = 1;
}
