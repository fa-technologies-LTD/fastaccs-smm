const [major] = process.versions.node.split('.').map((value) => Number.parseInt(value, 10));

const hasStructuredClone = typeof globalThis.structuredClone === 'function';
const hasCryptoGetRandomValues = typeof globalThis.crypto?.getRandomValues === 'function';
const isSupportedNode = major === 24;

if (!isSupportedNode) {
	console.error(`[runtime-check] Unsupported Node.js version ${process.version}. Required: 24.x.`);
	process.exit(1);
}

if (!hasStructuredClone || !hasCryptoGetRandomValues) {
	console.error(
		'[runtime-check] Missing required runtime APIs (structuredClone and/or crypto.getRandomValues).'
	);
	process.exit(1);
}

console.log(`[runtime-check] OK: ${process.version}`);
