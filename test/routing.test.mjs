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
		enrichOrgChart: ['POST', '/companies/org-chart/enrich', 'OrgChartEnrich'],
		enrichCorporateHierarchy: [
			'POST',
			'/companies/corporate-hierarchy/enrich',
			'CorporateHierarchyEnrich',
		],
		enrichTechnologies: ['POST', '/companies/technologies/enrich', 'TechnologyEnrich'],
		enrichHashtags: ['POST', '/companies/hashtags/enrich', 'HashtagEnrich'],
	},
	signal: {
		searchIntent: ['POST', '/intent/search', 'IntentSearch'],
		searchNews: ['POST', '/news/search', 'NewsSearch'],
		searchScoops: ['POST', '/scoops/search', 'ScoopSearch'],
		enrichIntent: ['POST', '/intent/enrich', 'IntentEnrich'],
		enrichNews: ['POST', '/news/enrich', 'NewsEnrich'],
		enrichScoops: ['POST', '/scoops/enrich', 'ScoopEnrich'],
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

describe('dynamic dropdown attributes', () => {
	test('company.enrichOrgChart merges selected departments into attributes as a CSV string', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'company',
				operation: 'enrichOrgChart',
				attributes: '{"companyId":"344589814"}',
				department: ['dept-1', 'dept-2'],
				returnAll: false,
				limit: 10,
			},
		});

		const [request] = server.requests;
		assert.equal(request.body?.data?.attributes?.department, 'dept-1,dept-2');
	});

	test('company.enrichOrgChart keeps a JSON-blob department when the dropdown is left empty', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'company',
				operation: 'enrichOrgChart',
				attributes: '{"companyId":"344589814","department":"legacy-dept"}',
				department: [],
				returnAll: false,
				limit: 10,
			},
		});

		const [request] = server.requests;
		assert.equal(request.body?.data?.attributes?.department, 'legacy-dept');
	});

	test('signal.searchIntent merges selected topics into attributes as an array', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'signal',
				operation: 'searchIntent',
				attributes: '{"signalScoreMin":80}',
				topics: ['topic-1', 'topic-2'],
				returnAll: false,
				limit: 10,
			},
		});

		const [request] = server.requests;
		assert.deepEqual(request.body?.data?.attributes?.topics, ['topic-1', 'topic-2']);
	});

	test('signal.enrichIntent merges selected topics into attributes as an array', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'signal',
				operation: 'enrichIntent',
				attributes: '{"companyId":"344589814"}',
				topics: ['topic-1'],
				returnAll: false,
				limit: 10,
			},
		});

		const [request] = server.requests;
		assert.deepEqual(request.body?.data?.attributes?.topics, ['topic-1']);
	});

	test('signal.searchIntent keeps a JSON-blob topics value when the dropdown is left empty', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'signal',
				operation: 'searchIntent',
				attributes: '{"topics":["legacy-topic"]}',
				topics: [],
				returnAll: false,
				limit: 10,
			},
		});

		const [request] = server.requests;
		assert.deepEqual(request.body?.data?.attributes?.topics, ['legacy-topic']);
	});
});

describe('lookup routing', () => {
	test('lookup.get → GET /lookup/{fieldName}', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: { resource: 'lookup', operation: 'get', fieldName: 'industries' },
		});

		const [request] = server.requests;
		assert.equal(request.method, 'GET');
		assert.equal(request.path, '/lookup/industries');
		assert.equal(request.body, undefined, 'GET operation should send no body');
	});

	test('lookup.get sends technology/hashtag filters as query params', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'lookup',
				operation: 'get',
				fieldName: 'tech-vendors',
				filterVendor: 'microsoft corporation',
			},
		});

		const [request] = server.requests;
		assert.equal(request.query.get('filter[vendor]'), 'microsoft corporation');
	});

	test('lookup.getSearchFields → GET /lookup/search', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'lookup',
				operation: 'getSearchFields',
				filterEntity: 'contact',
				filterFieldType: 'output',
			},
		});

		const [request] = server.requests;
		assert.equal(request.method, 'GET');
		assert.equal(request.path, '/lookup/search');
		assert.equal(request.query.get('filter[entity]'), 'contact');
		assert.equal(request.query.get('filter[fieldType]'), 'output');
	});

	test('lookup.getEnrichFields → GET /lookup/enrich', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'lookup',
				operation: 'getEnrichFields',
				filterEntity: 'orgChart',
				filterFieldType: 'input',
			},
		});

		const [request] = server.requests;
		assert.equal(request.method, 'GET');
		assert.equal(request.path, '/lookup/enrich');
		assert.equal(request.query.get('filter[entity]'), 'orgChart');
		assert.equal(request.query.get('filter[fieldType]'), 'input');
	});
});

describe('copilot routing', () => {
	/** Queues one JSON:API list response and runs an operation against the mock. */
	async function run(params, response = searchPage({ records: records(1) })) {
		server.reset();
		server.enqueue(response);
		const result = await runOperation({ baseURL: server.url, params });
		return { ...result, request: server.requests[0] };
	}

	test('contact.getLookalikes → GET /copilot/v1/contacts/lookalikes', async () => {
		const { request } = await run({
			resource: 'contact',
			operation: 'getLookalikes',
			referencePersonId: '123456',
			options: { targetCompanyId: '344589814' },
			limit: 10,
		});

		assert.equal(request.method, 'GET');
		assert.equal(request.path, '/copilot/v1/contacts/lookalikes');
		assert.equal(request.query.get('filter[referencePersonId]'), '123456');
		assert.equal(request.query.get('filter[targetCompanyId]'), '344589814');
		assert.equal(request.query.get('page[size]'), '10');
		assert.equal(request.body, undefined, 'GET operation should send no body');
	});

	test('contact.getLookalikes omits Target Company ID when it is not set', async () => {
		const { request } = await run({
			resource: 'contact',
			operation: 'getLookalikes',
			referencePersonId: '123456',
			options: {},
			limit: 25,
		});

		assert.equal(request.query.has('filter[targetCompanyId]'), false);
	});

	test('contact.getRecommendations → GET /copilot/v1/contacts/recommendations', async () => {
		const { request } = await run({
			resource: 'contact',
			operation: 'getRecommendations',
			companyId: '344589814',
			useCaseType: 'DEAL_ACCELERATION',
			limit: 5,
		});

		assert.equal(request.method, 'GET');
		assert.equal(request.path, '/copilot/v1/contacts/recommendations');
		assert.equal(request.query.get('filter[ziCompanyId]'), '344589814');
		assert.equal(request.query.get('filter[useCaseType]'), 'DEAL_ACCELERATION');
		assert.equal(request.query.get('page[size]'), '5');
	});

	test('company.getLookalikes sends the reference company and only the filters that were added', async () => {
		const { request } = await run({
			resource: 'company',
			operation: 'getLookalikes',
			companyId: '344589814',
			companyName: '',
			filters: { sameIndustry: true, sameCountry: false },
			limit: 20,
		});

		assert.equal(request.method, 'GET');
		assert.equal(request.path, '/copilot/v1/companies/lookalikes');
		assert.equal(request.query.get('filter[companyId]'), '344589814');
		assert.equal(request.query.has('filter[companyName]'), false, 'blank name must not be sent');
		assert.equal(request.query.get('filter[sameIndustry]'), 'true');
		assert.equal(request.query.get('filter[sameCountry]'), 'false');
		assert.equal(request.query.has('filter[sameRevenueRange]'), false);
		assert.equal(request.query.has('filter[sameEmployeeRange]'), false);
		assert.equal(request.query.get('page[size]'), '20');
	});

	test('company.getLookalikes accepts a Company Name alone', async () => {
		const { request } = await run({
			resource: 'company',
			operation: 'getLookalikes',
			companyId: '',
			companyName: 'ZoomInfo',
			filters: {},
			limit: 20,
		});

		assert.equal(request.query.get('filter[companyName]'), 'ZoomInfo');
		assert.equal(request.query.has('filter[companyId]'), false);
	});

	test('company.getLookalikes with neither ID nor name fails before any request is made', async () => {
		server.reset();
		await assert.rejects(
			runOperation({
				baseURL: server.url,
				params: {
					resource: 'company',
					operation: 'getLookalikes',
					companyId: '  ',
					companyName: '',
					filters: {},
					limit: 20,
				},
			}),
			/Company ID or Company Name is required/,
		);
		assert.equal(server.requests.length, 0);
	});

	test('copilot operations still authenticate with the PKCE credential', async () => {
		const { credentialTypes, request } = await run({
			resource: 'contact',
			operation: 'getRecommendations',
			companyId: '344589814',
			useCaseType: 'PROSPECTING',
			limit: 5,
		});

		assert.equal(request.headers.authorization, 'Bearer test-token');
		assert.deepEqual([...new Set(credentialTypes)], ['zoomInfoPkceOAuth2Api']);
	});
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

	test("sends data-API requests to the credential's base URL", async () => {
		// No requestDefaults override, so the node's own base URL expression runs.
		// The trailing slash checks it is stripped rather than doubled.
		server.reset();
		server.enqueue(searchPage({ records: records(1) }));

		await runOperation({
			credentialBaseUrl: `${server.url}/`,
			params: { resource: 'usage', operation: 'get' },
		});

		assert.equal(server.requests[0].path, '/data/v1/users/usage');
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
