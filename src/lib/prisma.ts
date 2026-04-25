import { PrismaClient } from '@prisma/client';
import { env } from '$env/dynamic/private';

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

const databaseUrl = (env.DATABASE_URL || process.env.DATABASE_URL || '').trim();

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
		log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
		errorFormat: 'minimal'
	});

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}

// Graceful shutdown
if (process.env.NODE_ENV === 'production') {
	process.on('beforeExit', async () => {
		await prisma.$disconnect();
	});
}
