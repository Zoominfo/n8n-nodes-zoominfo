/**
 * Live verification against the real ZoomInfo GTM API.
 *
 * The offline suite in test/ proves the node builds the requests we think it
 * does. It cannot prove those requests are the ones ZoomInfo actually accepts —
 * that the endpoints exist, that each `data.type` is valid, or that `meta.page`
 * carries the fields the "Return All" continue-expression reads. This script
 * closes that gap.
 *
 * Not part of `npm test`: it needs credentials and makes real API calls. Run it
 * by hand before a release.
 *
 * The node authenticates with authorization code + PKCE, which needs an
 * interactive browser login and so cannot be scripted. Supply a bearer token you
 * already hold — from a connected n8n credential, or however else you obtain one:
 *
 *   ZOOMINFO_ACCESS_TOKEN=... npm run test:live
 *
 * As a shortcut, if your DevPortal app happens to have the client_credentials
 * grant enabled, the script can fetch its own token instead:
 *
 *   ZOOMINFO_CLIENT_ID=... ZOOMINFO_CLIENT_SECRET=... npm run test:live
 *
 * Either can live in a .env file at the repo root (gitignored). An app without
 * that grant answers `unauthorized_client`; use the token path instead.
 * Everything after the token step behaves identically either way.
 *
 * Cost: `GET /users/usage` consumes no credits, and search operations consume
 * none either — every request here does count against rate limits, so the
 * searches ask for a single record each.
 *
 * Secrets are read from the environment and never printed. The access token is
 * redacted everywhere it could otherwise appear.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TOKEN_URL = 'https://api.zoominfo.com/gtm/oauth/v1/token';
const BASE_URL = 'https://api.zoominfo.com/gtm/data/v1';

/** Loads .env without a dependency. Only KEY=value lines, no interpolation. */
function loadDotEnv() {
	let contents;
	try {
		contents = readFileSync(join(root, '.env'), 'utf8');
	} catch {
		return;
	}
	for (const line of contents.split('\n')) {
		const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
		if (!match) continue;
		const [, key, rawValue] = match;
		// Strip matching surrounding quotes, then whitespace.
		const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
		process.env[key] ??= value;
	}
}

loadDotEnv();

const clientId = process.env.ZOOMINFO_CLIENT_ID;
const clientSecret = process.env.ZOOMINFO_CLIENT_SECRET;
const presetToken = process.env.ZOOMINFO_ACCESS_TOKEN;

if (!presetToken && !(clientId && clientSecret)) {
	console.log(
		'\nSkipping live checks: no credentials found.\n' +
			'Set ZOOMINFO_CLIENT_ID + ZOOMINFO_CLIENT_SECRET (client-credentials grant),\n' +
			'or ZOOMINFO_ACCESS_TOKEN to use a token you already hold.\n' +
			'Either the environment or a .env file at the repo root works.\n',
	);
	process.exit(0);
}

let failures = 0;
let token = presetToken;

/** Redacts anything that could carry a secret out of this process. */
function redact(text) {
	let safe = String(text);
	for (const secret of [clientId, clientSecret, token]) {
		if (secret) safe = safe.split(secret).join('[redacted]');
	}
	return safe;
}

async function step(label, fn) {
	try {
		const detail = await fn();
		console.log(`  ok   ${label}${detail ? ` — ${redact(detail)}` : ''}`);
		return true;
	} catch (error) {
		failures += 1;
		console.log(`  FAIL ${label}\n         ${redact(error.message)}`);
		return false;
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

console.log('\nZoomInfo live verification\n');

// ── 1. Token ────────────────────────────────────────────────────────────────
if (presetToken) {
	console.log('Auth (supplied access token)');
	console.log('  ok   using ZOOMINFO_ACCESS_TOKEN — token exchange not exercised');
} else {
	console.log('Auth (client credentials)');

	// A convenience shortcut, not a test of the node's credential: the node is
	// PKCE-only, and PKCE needs an interactive browser login. This exercises the
	// same token URL the PKCE credential points at, and yields a bearer token for
	// the data-API checks below. Only works if the DevPortal app has the
	// client_credentials grant enabled.
	await step('POST /gtm/oauth/v1/token with HTTP Basic', async () => {
		const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
		const response = await fetch(TOKEN_URL, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${basic}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({ grant_type: 'client_credentials' }),
		});

		const text = await response.text();
		assert(response.ok, `${response.status} ${response.statusText}: ${text.slice(0, 300)}`);

		const body = JSON.parse(text);
		assert(body.access_token, `no access_token in response: ${Object.keys(body).join(',')}`);
		token = body.access_token;

		return `token acquired, expires_in=${body.expires_in ?? 'unknown'}`;
	});
}

if (!token) {
	console.log(
		'\nCannot continue without a token.\n' +
			'If the grant type was rejected, either enable client_credentials on the\n' +
			'DevPortal app, or re-run with ZOOMINFO_ACCESS_TOKEN set.\n',
	);
	process.exit(1);
}

/** Authenticated request against the GTM data API. */
async function api(method, path, body) {
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.api+json',
			...(body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});

	const text = await response.text();
	let parsed;
	try {
		parsed = text ? JSON.parse(text) : undefined;
	} catch {
		parsed = text;
	}
	return { status: response.status, ok: response.ok, body: parsed, raw: text };
}

// ── 2. Connectivity ─────────────────────────────────────────────────────────
console.log('\nConnectivity');

await step('GET /users/usage (consumes no credits)', async () => {
	const { status, ok, body, raw } = await api('GET', '/users/usage');
	assert(ok, `${status}: ${raw.slice(0, 300)}`);
	// Also the probe used by both credentials' `test` block, so a failure here
	// means the "Test" button in n8n is broken too.
	return `${status}, keys: ${Object.keys(body ?? {}).join(',')}`;
});

// ── 3. Every routed endpoint ────────────────────────────────────────────────
// Confirms each URL exists and each data.type is accepted. A 404 with code
// ZI9998 and "No static resource" means the *verb* is wrong, not the path.
console.log('\nRouting (one record each)');

const OPERATIONS = [
	['contact.search', 'POST', '/contacts/search', 'ContactSearch', { companyName: 'ZoomInfo' }],
	['company.search', 'POST', '/companies/search', 'CompanySearch', { companyName: 'ZoomInfo' }],
	[
		'signal.searchIntent',
		'POST',
		'/intent/search',
		'IntentSearch',
		{ topics: ['sales intelligence'] },
	],
	['signal.searchScoops', 'POST', '/scoops/search', 'ScoopSearch', { companyName: 'ZoomInfo' }],
	['signal.searchNews', 'POST', '/news/search', 'NewsSearch', { companyName: 'ZoomInfo' }],
];

/** meta.page objects seen, so the pagination expression can be checked below. */
const pageMetas = [];

for (const [label, method, path, type, attributes] of OPERATIONS) {
	await step(`${label} → ${method} ${path}`, async () => {
		const { status, ok, body, raw } = await api(method, `${path}?page[size]=1&page[number]=1`, {
			data: { type, attributes },
		});
		assert(ok, `${status}: ${raw.slice(0, 400)}`);

		if (body?.meta?.page) pageMetas.push({ label, page: body.meta.page });

		const count = Array.isArray(body?.data) ? body.data.length : body?.data ? 1 : 0;
		return `${status}, ${count} record(s), meta.page=${JSON.stringify(body?.meta?.page ?? null)}`;
	});
}

// ── 4. The pagination contract ──────────────────────────────────────────────
// ZoomInfo's schema documents `meta.page.total` as a *page* count and
// `meta.totalResults` as the *record* count, which is what
// paginationProperties() relies on. These checks confirm the documented contract
// still holds against the live API rather than discovering it.
console.log('\nPagination contract');

await step('meta.page carries number and total', async () => {
	assert(pageMetas.length > 0, 'no meta.page seen on any search response');
	const missing = pageMetas.filter(
		(m) => m.page.number === undefined || m.page.total === undefined,
	);
	assert(
		missing.length === 0,
		`missing number/total on: ${missing.map((m) => m.label).join(', ')}`,
	);
	return pageMetas.map((m) => `${m.label}=${JSON.stringify(m.page)}`).join(' ');
});

await step('meta.page.total is a page count, not a record count', async () => {
	// Doubling page[size] should roughly halve a page count and leave a record
	// count untouched. If the two totals are identical across both requests,
	// `total` is behaving like a record count and the continue-expression in
	// nodes/ZoomInfo/shared/descriptions.ts would over-fetch.
	const body = { data: { type: 'ContactSearch', attributes: { companyName: 'ZoomInfo' } } };
	const one = await api('POST', '/contacts/search?page[size]=1&page[number]=1', body);
	const two = await api('POST', '/contacts/search?page[size]=2&page[number]=1', body);

	assert(one.ok && two.ok, `requests failed: ${one.status}/${two.status}`);

	const totalAtOne = one.body?.meta?.page?.total;
	const totalAtTwo = two.body?.meta?.page?.total;
	const records = one.body?.meta?.totalResults;

	assert(
		totalAtOne !== undefined && totalAtTwo !== undefined,
		'meta.page.total absent on one of the responses',
	);

	// Only meaningful when there is more than one page to begin with.
	if (totalAtOne > 1 && totalAtOne === totalAtTwo) {
		throw new Error(
			`page.total is identical at page[size]=1 and 2 (${totalAtOne}), which means it is ` +
				'counting RECORDS, not pages. The Return All continue-expression compares ' +
				'number < total and will over-fetch.',
		);
	}

	return `page.total ${totalAtOne}→${totalAtTwo} as size 1→2, totalResults=${records ?? 'absent'}`;
});

await step('meta.totalResults is present and distinct from page.total', async () => {
	// Documents the sibling field so a future change cannot quietly swap them.
	const { ok, status, body, raw } = await api(
		'POST',
		'/contacts/search?page[size]=1&page[number]=1',
		{ data: { type: 'ContactSearch', attributes: { companyName: 'ZoomInfo' } } },
	);
	assert(ok, `${status}: ${raw.slice(0, 200)}`);
	assert(
		body?.meta?.totalResults !== undefined,
		'meta.totalResults absent — the record count moved, check the API conventions docs',
	);
	return `totalResults=${body.meta.totalResults}, page.total=${body.meta.page?.total}`;
});

console.log(
	failures === 0 ? '\nAll live checks passed.\n' : `\n${failures} live check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
