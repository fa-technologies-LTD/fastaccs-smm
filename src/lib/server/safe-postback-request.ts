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

/** Expand any valid IPv6 spelling (compressed, expanded, dotted IPv4 tail, zone id) to 8 hextets. */
function expandIpv6(ip: string): number[] | null {
	let address = ip.toLowerCase();
	const zone = address.indexOf('%');
	if (zone >= 0) address = address.slice(0, zone);
	const lastColon = address.lastIndexOf(':');
	const tail = address.slice(lastColon + 1);
	if (tail.includes('.')) {
		const v4 = ipv4Parts(tail);
		if (!v4) return null;
		address = `${address.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
	}
	const halves = address.split('::');
	if (halves.length > 2) return null;
	const left = halves[0] ? halves[0].split(':') : [];
	const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
	const missing = 8 - left.length - right.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
	const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
	if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
	return groups.map((g) => parseInt(g, 16));
}

function v4FromHextets(high: number, low: number): string {
	return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isPublicAddress(ip: string): boolean {
	const family = isIP(ip.split('%')[0]);
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
		const h = expandIpv6(ip);
		if (!h) return false;
		const zeros = (count: number) => h.slice(0, count).every((part) => part === 0);
		const embeddedV4 = () => v4FromHextets(h[6], h[7]);
		if (h.every((part) => part === 0)) return false; // unspecified ::
		if (zeros(7) && h[7] === 1) return false; // loopback ::1 (any spelling)
		if (zeros(5) && h[5] === 0xffff) return isPublicAddress(embeddedV4()); // ::ffff:a.b.c.d
		if (zeros(4) && h[4] === 0xffff && h[5] === 0) return isPublicAddress(embeddedV4()); // ::ffff:0:a.b.c.d
		if (zeros(6)) return isPublicAddress(embeddedV4()); // deprecated ::a.b.c.d
		if (h[0] === 0x64 && h[1] === 0xff9b) {
			// NAT64: well-known prefix embeds an IPv4 address; local-use 64:ff9b:1::/48 is private.
			return h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0
				? isPublicAddress(embeddedV4())
				: false;
		}
		if ((h[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
		if ((h[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
		if ((h[0] & 0xffc0) === 0xfec0) return false; // site-local fec0::/10 (deprecated)
		if ((h[0] & 0xff00) === 0xff00) return false; // multicast
		if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
		if (h[0] === 0x2001 && h[1] === 0) return false; // Teredo tunnelling
		if (h[0] === 0x2002) return false; // 6to4 (embeds IPv4)
		if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return false; // discard
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
