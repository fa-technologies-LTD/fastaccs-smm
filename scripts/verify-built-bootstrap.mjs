import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Concurrent Kit sync/check/test processes can overwrite generated server options mid-build.
// Reject mismatched bootstrap identities before any preview or deployment is considered ready.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.svelte-kit', 'output');
function files(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]
	);
}
const serverIdentities = new Set();
for (const file of files(join(root, 'server', 'chunks')).filter((path) => path.endsWith('.js'))) {
	for (const match of readFileSync(file, 'utf8').matchAll(/version_hash:\s*["']([a-z0-9]+)["']/g)) {
		serverIdentities.add(match[1]);
	}
}
assert.equal(serverIdentities.size, 1, 'Built server bootstrap identity is missing or ambiguous.');
const [expected] = serverIdentities;
const identities = new Set();
for (const file of files(join(root, 'client', '_app', 'immutable')).filter((path) =>
	path.endsWith('.js')
)) {
	for (const match of readFileSync(file, 'utf8').matchAll(/globalThis\.__sveltekit_([a-z0-9]+)/g)) {
		if (!['sw', 'dev'].includes(match[1])) identities.add(match[1]);
	}
}
assert.deepEqual(
	[...identities],
	[expected],
	'Client/server bootstrap mismatch. Finish checks/tests, then rebuild alone before previewing or deploying.'
);
console.log('[build-bootstrap] Client and server startup identities match.');
