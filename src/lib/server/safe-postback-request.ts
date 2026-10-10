import { request } from 'node:https';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { isIP } from 'node:net';

/**
 * Outbound GET for ad-network conversion postbacks.
 * - HTTPS only (node:https), redirects never followed (3xx is returned as a status).
 * - Every address the hostname resolves to is checked AT CONNECT TIME by a custom lookup, so a
 *   DNS answer pointing at loopback/private/link-local space is refused even if it changed after
 *   validation (DNS rebinding).
 */

export type PostbackRequestResult = { status: number } | { error: unknown };

function ipv4Parts(ip: string): number[] | null {
	const parts = ip.split('.').map(Number);
	return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)
		? parts
		: null;
}

export function isPublicAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 4) {
		const [a, b] = ipv4Parts(ip)!;
		if (a === 0 || a === 10 || a === 127) return false;
		if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
		if (a === 169 && b === 254) return false; // link-local (incl. cloud metadata)
		if (a === 172 && b >= 16 && b <= 31) return false;
		if (a === 192 && b === 168) return false;
		if (a === 192 && b === 0) return false; // IETF protocol assignments
		if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
		if (a >= 224) return false; // multicast + reserved + broadcast
		return true;
	}
	if (family === 6) {
		const lower = ip.toLowerCase();
		const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPublicAddress(mapped[1]);
		if (lower === '::' || lower === '::1') return false;
		if (/^f[cd]/.test(lower)) return false; // unique local fc00::/7
		if (/^fe[89ab]/.test(lower)) return false; // link-local fe80::/10
		if (lower.startsWith('ff')) return false; // multicast
		if (lower.startsWith('64:ff9b:') || lower.startsWith('2001:db8')) return false;
		return true;
	}
	return false;
}

type LookupCallback = (
	error: NodeJS.ErrnoException | null,
	address: string | LookupAddress[],
	family?: number
) => void;

type Resolver = (
	hostname: string,
	options: { all: true },
	callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void
) => void;

/** dns.lookup replacement that refuses non-public addresses. */
export function createSafeLookup(resolve: Resolver = dnsLookup as unknown as Resolver) {
	return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
		resolve(hostname, { all: true }, (error, addresses) => {
			if (error) return callback(error, '');
			const list = (addresses ?? []).filter((entry) =>
				options?.family ? entry.family === options.family : true
			);
			if (list.length === 0 || list.some((entry) => !isPublicAddress(entry.address))) {
				const blocked = Object.assign(new Error(`Blocked non-public address for ${hostname}`), {
					code: 'EUNSAFEADDR'
				});
				return callback(blocked, '');
			}
			if (options?.all) return callback(null, list);
			return callback(null, list[0].address, list[0].family);
		});
	};
}

export function sendPostbackRequest(
	url: string,
	timeoutMs = 5_000
): Promise<PostbackRequestResult> {
	return new Promise((resolve) => {
		let settled = false;
		const done = (result: PostbackRequestResult) => {
			if (!settled) {
				settled = true;
				resolve(result);
			}
		};
		let req: ReturnType<typeof request>;
		try {
			req = request(
				url,
				{
					method: 'GET',
					lookup: createSafeLookup() as never,
					timeout: timeoutMs,
					headers: { 'User-Agent': 'FastAccs-Postback/1' }
				},
				(res) => {
					res.resume();
					done({ status: res.statusCode ?? 0 });
				}
			);
		} catch (error) {
			done({ error });
			return;
		}
		req.on('timeout', () =>
			req.destroy(Object.assign(new Error('Postback timed out'), { code: 'ETIMEDOUT' }))
		);
		req.on('error', (error) => done({ error }));
		req.end();
	});
}
