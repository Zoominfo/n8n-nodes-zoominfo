/**
 * Pagination and limit behaviour.
 *
 * This is the file that matters most. Two real bugs lived here and were only
 * visible once a request was actually built:
 *
 *  1. `page[number]=NaN` on every paged request. The pagination block used
 *     `{{ $pageCount + 1 }}`, but `$pageCount` only exists for function-style
 *     pagination — in a declarative `generic` block it resolves to undefined.
 *  2. `sort` and `page[size]` silently disappeared as soon as Return All was
 *     switched on, because the router shallow-merges the pagination `qs` over
 *     the base request options, replacing the base query wholesale.
 *
 * Both are asserted against the literal query string rather than a parsed
 * object, since the query is also where lodash's `set()` bracket handling could
 * bite (`page[size]` becomes a nested object internally).
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

import { startMockServer, searchPage, records } from './mock-server.mjs';
import { runOperation, json } from './harness.mjs';

let server;
before(async () => {
	server = await startMockServer();
});
after(async () => {
	await server.close();
});

const searchParams = (overrides) => ({
	resource: 'contact',
	operation: 'search',
	attributes: '{}',
	sortBy: 'relevance',
	sortDescending: false,
	...overrides,
});

/** Decoded query params of the nth request, as a plain object. */
function query(n = 0) {
	return Object.fromEntries(server.requests[n].query.entries());
}

describe('limit (Return All off)', () => {
	test('maps Limit to page[size] on the wire', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(5) }));

		await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: false, limit: 25 }),
		});

		assert.equal(server.requests.length, 1);
		// Asserted on the raw query: page[size] is built via lodash set() and
		// therefore lives as a nested object before serialization.
		assert.equal(query()['page[size]'], '25');
		assert.equal(query()['page[number]'], undefined, 'no page[number] without Return All');
	});

	test('Limit is not clobbered by the Return All routing', async () => {
		// Regression guard. Return All previously carried a static
		// `send.value: '100'` for page[size], which the router applies whenever
		// the property is *visible* rather than when it is true. Both properties
		// then wrote page[size] and Limit won only by being later in the array
		// returned from paginationProperties() — so a harmless-looking reorder
		// would have capped every search at 100.
		server.reset();
		server.enqueue(searchPage({ records: records(3) }));

		await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: false, limit: 7 }),
		});

		assert.equal(query()['page[size]'], '7', 'Limit must win, and be the only page[size]');
		assert.equal(
			(server.requests[0].rawQuery.match(/page%5Bsize%5D/g) ?? []).length,
			1,
			'page[size] must appear exactly once',
		);
	});

	test('truncates the response to Limit via maxResults', async () => {
		// The API may return more than asked; maxResults trims after unwrapping.
		server.reset();
		server.enqueue(searchPage({ records: records(5) }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: false, limit: 2 }),
		});

		assert.equal(items.length, 2);
		assert.deepEqual(
			json(items).map((r) => r.id),
			['rec-1', 'rec-2'],
		);
	});
});

describe('Return All', () => {
	test('walks pages until meta.page.number reaches meta.page.total', async () => {
		server.reset();
		server.enqueue(
			searchPage({ records: records(2, 'p1'), number: 1, total: 3 }),
			searchPage({ records: records(2, 'p2'), number: 2, total: 3 }),
			searchPage({ records: records(2, 'p3'), number: 3, total: 3 }),
		);

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: true }),
		});

		assert.equal(server.requests.length, 3, 'should request exactly three pages');
		assert.equal(items.length, 6, 'should accumulate every record');
		assert.deepEqual(
			json(items).map((r) => r.id),
			['p1-1', 'p1-2', 'p2-1', 'p2-2', 'p3-1', 'p3-2'],
		);
	});

	test('requests page numbers 1, 2, 3 — never NaN', async () => {
		// Guards bug 1. `$pageCount` is unavailable in a declarative generic
		// pagination block, so the page number is read back from the server's
		// own meta.page.number.
		server.reset();
		server.enqueue(
			searchPage({ records: records(1, 'p1'), number: 1, total: 3 }),
			searchPage({ records: records(1, 'p2'), number: 2, total: 3 }),
			searchPage({ records: records(1, 'p3'), number: 3, total: 3 }),
		);

		await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: true }),
		});

		assert.deepEqual(
			server.requests.map((r) => r.query.get('page[number]')),
			['1', '2', '3'],
		);
		for (const request of server.requests) {
			assert.doesNotMatch(request.rawQuery, /NaN/, 'page[number] resolved to NaN');
		}
	});

	test('carries sort and page[size] across every paged request', async () => {
		// Guards bug 2. The router replaces the base qs with the pagination qs,
		// so anything the paged request still needs must be carried over.
		server.reset();
		server.enqueue(
			searchPage({ records: records(1, 'p1'), number: 1, total: 2 }),
			searchPage({ records: records(1, 'p2'), number: 2, total: 2 }),
		);

		await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: true, sortBy: 'lastName', sortDescending: true }),
		});

		assert.equal(server.requests.length, 2);
		for (const [index] of server.requests.entries()) {
			assert.equal(query(index).sort, '-lastName', `sort lost on request ${index + 1}`);
			assert.equal(query(index)['page[size]'], '100', `page[size] lost on request ${index + 1}`);
		}
	});

	test('stops after one request when there is only one page', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(2), number: 1, total: 1 }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: true }),
		});

		assert.equal(server.requests.length, 1);
		assert.equal(items.length, 2);
	});

	test('stops rather than looping when meta is absent', async () => {
		// A malformed or unexpected response must not spin forever. The continue
		// expression defaults both sides to 1, so 1 < 1 is false.
		server.reset();
		server.enqueue({ body: { data: records(2) } });

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: true }),
		});

		assert.equal(server.requests.length, 1, 'must not paginate without meta');
		assert.equal(items.length, 2);
	});

	test('omits sort entirely on resources that have none', async () => {
		// Signal operations expose no sort properties. The carried-over sort must
		// resolve to nothing rather than a literal "undefined".
		server.reset();
		server.enqueue(
			searchPage({ records: records(1, 'i1'), number: 1, total: 2 }),
			searchPage({ records: records(1, 'i2'), number: 2, total: 2 }),
		);

		await runOperation({
			baseURL: server.url,
			params: {
				resource: 'signal',
				operation: 'searchIntent',
				attributes: '{"topics":["data enrichment"]}',
				returnAll: true,
			},
		});

		for (const request of server.requests) {
			assert.equal(request.query.get('sort'), null, 'sort should be absent, not empty');
			assert.doesNotMatch(request.rawQuery, /undefined/, 'sort serialized as "undefined"');
			assert.equal(request.query.get('page[size]'), '100');
		}
	});
});

describe('meta.page semantics — pages, not records', () => {
	// ZoomInfo's schema defines `meta.page.total` as "the total number of pages
	// within the current result set", with the record count in the *sibling*
	// field `meta.totalResults`. The two are adjacent and easy to confuse, and
	// reading the wrong one breaks Return All in a way no unit test would notice
	// unless it is asserted directly.

	test('stops at meta.page.total even when totalResults is much larger', async () => {
		// 2 pages, 4207 matching records. Paginating on the record count would
		// keep requesting pages long past the end of the result set.
		server.reset();
		server.enqueue(
			searchPage({ records: records(2, 'p1'), number: 1, total: 2, totalResults: 4207 }),
			searchPage({ records: records(2, 'p2'), number: 2, total: 2, totalResults: 4207 }),
		);

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: true }),
		});

		assert.equal(server.requests.length, 2, 'must stop at page 2 of 2, not chase totalResults');
		assert.equal(items.length, 4);
	});

	test('a single page with many records makes exactly one request', async () => {
		// The degenerate case that catches the confusion most cleanly: one page,
		// but totalResults in the thousands.
		server.reset();
		server.enqueue(searchPage({ records: records(3), number: 1, total: 1, totalResults: 9999 }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: true }),
		});

		assert.equal(server.requests.length, 1, 'one page means one request');
		assert.equal(items.length, 3);
	});

	test('totalResults is not leaked into the returned items', async () => {
		// rootProperty unwraps to `data`, so meta should not survive into items.
		server.reset();
		server.enqueue(searchPage({ records: records(2), number: 1, total: 1, totalResults: 500 }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ returnAll: false, limit: 10 }),
		});

		for (const record of json(items)) {
			assert.equal(record.totalResults, undefined);
			assert.equal(record.meta, undefined);
		}
	});
});
