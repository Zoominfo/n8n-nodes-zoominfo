/**
 * Smoke test for the compiled node. Runs against dist/, so `npm run build`
 * first. Verifies the things that silently break at runtime rather than at
 * compile time: credential wiring, JSON:API envelopes, per-operation routing,
 * and property-name collisions within a single resource/operation view.
 *
 * Deliberately dependency-free.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let checks = 0;

function check(label, fn) {
	checks += 1;
	try {
		const detail = fn();
		console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
	} catch (error) {
		failures += 1;
		console.log(`  FAIL ${label}\n         ${error.message}`);
	}
}

async function checkAsync(label, fn) {
	checks += 1;
	try {
		const detail = await fn();
		console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
	} catch (error) {
		failures += 1;
		console.log(`  FAIL ${label}\n         ${error.message}`);
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

// ── The routing contract, from docs.zoominfo.com/reference/* ────────────────
// resource → operation → [method, url, data.type]
const EXPECTED = {
	contact: {
		search: ['POST', '/contacts/search', 'ContactSearch'],
		enrich: ['POST', '/contacts/enrich', 'ContactEnrich'],
	},
	company: {
		search: ['POST', '/companies/search', 'CompanySearch'],
		enrich: ['POST', '/companies/enrich', 'CompanyEnrich'],
	},
	signal: {
		searchIntent: ['POST', '/intent/search', 'IntentSearch'],
		searchNews: ['POST', '/news/search', 'NewsSearch'],
		searchScoops: ['POST', '/scoops/search', 'ScoopSearch'],
	},
	usage: {
		get: ['GET', '/users/usage', null],
	},
};

console.log('\nZoomInfo node smoke test\n');

const nodePath = join(root, 'dist/nodes/ZoomInfo/ZoomInfo.node.js');
assert(existsSync(nodePath), `missing ${nodePath} — run "npm run build" first`);

const { ZoomInfo } = require(nodePath);
const description = new ZoomInfo().description;

console.log('Node description');
check('node name is zoomInfo', () => {
	assert(description.name === 'zoomInfo', `got ${description.name}`);
});
check('base URL targets the GTM data API', () => {
	const expected = 'https://api.zoominfo.com/gtm/data/v1';
	assert(description.requestDefaults.baseURL === expected, `got ${description.requestDefaults.baseURL}`);
	return expected;
});
check('sends the JSON:API media type', () => {
	const headers = description.requestDefaults.headers;
	assert(headers['Content-Type'] === 'application/vnd.api+json', `got ${headers['Content-Type']}`);
	assert(headers.Accept === 'application/vnd.api+json', `got ${headers.Accept}`);
});
check('PKCE is the default authentication', () => {
	const auth = description.properties.find((p) => p.name === 'authentication');
	assert(auth, 'no authentication property');
	assert(auth.default === 'pkce', `default is ${auth.default}`);
});

console.log('\nCredentials');
for (const cred of description.credentials) {
	check(`${cred.name} resolves to a compiled class`, () => {
		const pkg = require(join(root, 'package.json'));
		const file = pkg.n8n.credentials.find((c) => {
			const mod = require(join(root, c));
			return Object.values(mod).some((exported) => {
				try {
					return new exported().name === cred.name;
				} catch {
					return false;
				}
			});
		});
		assert(file, `no credential class declares name "${cred.name}"`);
		return file.replace('dist/credentials/', '');
	});
}

console.log('\nOperation routing');
const resourceProp = description.properties.find((p) => p.name === 'resource');
check('resource list matches the documented set', () => {
	const got = resourceProp.options.map((o) => o.value).sort();
	const want = Object.keys(EXPECTED).sort();
	assert(JSON.stringify(got) === JSON.stringify(want), `got ${got.join(',')}`);
	return got.join(', ');
});

for (const [resource, operations] of Object.entries(EXPECTED)) {
	const opProp = description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
	);
	check(`${resource}: has an operation selector`, () => {
		assert(opProp, `no operation property shown for resource "${resource}"`);
	});
	if (!opProp) continue;

	for (const [operation, [method, url, type]] of Object.entries(operations)) {
		check(`${resource}.${operation} → ${method} ${url}`, () => {
			const option = opProp.options.find((o) => o.value === operation);
			assert(option, `operation "${operation}" not offered`);
			const request = option.routing?.request;
			assert(request, 'no routing.request');
			assert(request.method === method, `method is ${request.method}`);
			assert(request.url === url, `url is ${request.url}`);
			if (type === null) {
				assert(request.body === undefined, 'GET operation should send no body');
			} else {
				assert(request.body?.data?.type === type, `data.type is ${request.body?.data?.type}`);
			}
		});
	}
}

console.log('\nProperty visibility');
for (const [resource, operations] of Object.entries(EXPECTED)) {
	for (const operation of Object.keys(operations)) {
		check(`${resource}.${operation}: no duplicate property names`, () => {
			const visible = description.properties.filter((p) => {
				const show = p.displayOptions?.show;
				if (!show) return true;
				if (show.resource && !show.resource.includes(resource)) return false;
				if (show.operation && !show.operation.includes(operation)) return false;
				return true;
			});
			const names = visible.map((p) => p.name);
			const dupes = names.filter((n, i) => names.indexOf(n) !== i);
			assert(dupes.length === 0, `duplicated: ${[...new Set(dupes)].join(', ')}`);
			return `${names.length} properties`;
		});
	}
}

console.log('\nJSON:API envelope (applyAttributes)');
const { applyAttributes } = require(join(root, 'dist/nodes/ZoomInfo/shared/utils.js'));

function mockContext(value) {
	return {
		getNodeParameter: () => value,
		getNode: () => ({ name: 'ZoomInfo', type: 'zoomInfo', typeVersion: 1, position: [0, 0] }),
	};
}

async function envelope(value, body) {
	return await applyAttributes.call(mockContext(value), { body, url: '/contacts/search' });
}

await checkAsync('wraps attributes and preserves the routed data.type', async () => {
	const out = await envelope('{"companyName":"ZoomInfo"}', { data: { type: 'ContactSearch' } });
	assert(out.body.data.type === 'ContactSearch', `type lost: ${JSON.stringify(out.body)}`);
	assert(out.body.data.attributes.companyName === 'ZoomInfo', `attributes wrong: ${JSON.stringify(out.body)}`);
	return JSON.stringify(out.body);
});

await checkAsync('accepts an already-parsed object', async () => {
	const out = await envelope({ jobTitle: 'engineer' }, { data: { type: 'ContactSearch' } });
	assert(out.body.data.attributes.jobTitle === 'engineer', JSON.stringify(out.body));
});

await checkAsync('treats empty input as empty attributes', async () => {
	const out = await envelope('', { data: { type: 'CompanySearch' } });
	assert(JSON.stringify(out.body.data.attributes) === '{}', JSON.stringify(out.body));
});

await checkAsync('rejects malformed JSON', async () => {
	let threw = false;
	try {
		await envelope('{not json', { data: { type: 'ContactSearch' } });
	} catch (error) {
		threw = true;
		assert(/valid JSON/i.test(error.message), `unexpected message: ${error.message}`);
	}
	assert(threw, 'malformed JSON was accepted');
});

await checkAsync('rejects a JSON array', async () => {
	let threw = false;
	try {
		await envelope('[1,2,3]', { data: { type: 'ContactSearch' } });
	} catch {
		threw = true;
	}
	assert(threw, 'array was accepted as attributes');
});


console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
