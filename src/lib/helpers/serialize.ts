import { Prisma } from '@prisma/client';

/**
 * Deep-convert every Prisma Decimal in a value to a plain number so it can cross the
 * SvelteKit load boundary. Prisma Decimals are non-POJOs and throw
 * "Cannot stringify arbitrary non-POJOs" when returned from a `load`.
 *
 * Dates are preserved as-is. Uses `Prisma.Decimal.isDecimal` (minification-proof) rather
 * than `constructor.name`. Wrap the final return object of any server `load` that pulls
 * raw Prisma rows — it's idempotent (plain numbers stay numbers).
 */
export function toSerializableDecimals<T>(value: T): T {
	if (value === null || value === undefined || value instanceof Date) return value;
	if (Prisma.Decimal.isDecimal(value)) {
		return (value as unknown as Prisma.Decimal).toNumber() as unknown as T;
	}
	if (typeof value === 'object') {
		if (Array.isArray(value)) {
			return value.map((item) => toSerializableDecimals(item)) as unknown as T;
		}
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>)) {
			out[key] = toSerializableDecimals((value as Record<string, unknown>)[key]);
		}
		return out as T;
	}
	return value;
}
