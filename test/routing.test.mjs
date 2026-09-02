/**
 * Every operation's built request: method, path, JSON:API envelope, headers.
 *
 * scripts/smoke.mjs asserts the same routing table off the static description.
 * The overlap is deliberate — this file asserts what actually goes over the
 * wire, which is a different claim.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

import { startMockServer, searchPage, records } from './mock-server.mjs';
import { runOperation } from './harness.mjs';

let server;
before(async () => {
	server = await startMockServer();
});
after(async () => {
	await server.close();
});

/** resource → operation → [method, path, data.type | null] */
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

describe('operation routing', () => {
	for (const [resource, operations] of Object.entries(EXPECTED)) {
		for (const [operation, [method, path, dataType]] of Object.entries(operations)) {
			test(`${resource}.${operation} → ${method} ${path}`, async () => {
				server.reset();
				server.enqueue(searchPage({ records: records(1) }));

				await runOperation({
					baseURL: server.url,
					params: {
						resource,
						operation,
						attributes: '{"companyName":"ZoomInfo"}',
						returnAll: false,
						limit: 10,
						sortBy: 'relevance',
						sortDescending: false,
					},
				});

				assert.equal(server.requests.length, 1, 'expected exactly one request');
				const [request] = server.requests;

				assert.equal(request.method, method);
				assert.equal(request.path, path);

				if (dataType === null) {
					// GET /users/usage takes no body at all.
					assert.equal(request.body, undefined, 'GET operation should send no body');
				} else {
					assert.equal(request.body?.data?.type, dataType, 'wrong data.type');
					assert.deepEqual(
						request.body?.data?.attributes,
						{ companyName: 'ZoomInfo' },
						'attributes should be nested under data.attributes',
					);
				}
			});
		}
	}
});

describe('request defaults', () => {
	test('sends the JSON:API media type on both Accept and Content-Type', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'contact',
				operation: 'search',
				attributes: '{}',
				returnAll: false,
				limit: 10,
				sortBy: 'relevance',
				sortDescending: false,
			},
		});

		const [request] = server.requests;
		assert.equal(request.headers.accept, 'application/vnd.api+json');
		assert.match(request.headers['content-type'], /application\/vnd\.api\+json/);
	});

	test('applies the credential Authorization header', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'usage',
				operation: 'get',
			},
		});

		assert.equal(server.requests[0].headers.authorization, 'Bearer test-token');
	});
});

describe('credentials', () => {
	// The node is PKCE-only. A client-credentials alternative was dropped because
	// it requires a DevPortal grant that is off by default, so most users who
	// picked it hit `unauthorized_client`. With one credential there is no
	// `authentication` switch, and the router must resolve it unconditionally.
	test('the router resolves the PKCE credential', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		const { credentialTypes } = await runOperation({
			baseURL: server.url,
			params: { resource: 'usage', operation: 'get' },
		});

		// Deduplicated: the router resolves credentials more than once per
		// request. What matters is that nothing other than the PKCE credential is
		// ever asked for.
		assert.deepEqual([...new Set(credentialTypes)], ['zoomInfoPkceOAuth2Api']);
	});

	test('resolves it without an authentication parameter present', async () => {
		// Guards the removal: if a stray `authentication` displayOptions condition
		// came back on the credential, no credential would match and the router
		// would throw "does not have any credentials of type undefined".
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: {
				resource: 'contact',
				operation: 'search',
				attributes: '{}',
				returnAll: false,
				limit: 10,
				sortBy: 'relevance',
				sortDescending: false,
			},
		});

		assert.equal(items.length, 1);
		assert.equal(server.requests[0].headers.authorization, 'Bearer test-token');
	});
});
