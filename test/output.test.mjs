/**
 * Response unwrapping: the `rootProperty` postReceive action that turns a
 * JSON:API `data` array into one n8n item per record.
 *
 * The ordering assertion is the point of interest. `rootProperty` is declared on
 * the operation option while `maxResults` is declared on the Limit property, and
 * the router collects postReceive actions in property order. Unwrap therefore
 * has to run before the limit trims, or Limit would truncate a one-element list
 * containing the whole envelope.
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
	returnAll: false,
	limit: 50,
	...overrides,
});

describe('rootProperty unwrapping', () => {
	test('yields one item per record, not one item per response', async () => {
		server.reset();
		server.enqueue(searchPage({ records: records(3) }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams(),
		});

		assert.equal(items.length, 3);
		assert.deepEqual(
			json(items).map((r) => r.id),
			['rec-1', 'rec-2', 'rec-3'],
		);
		// The envelope itself must not leak into the items.
		for (const record of json(items)) {
			assert.equal(record.meta, undefined);
			assert.equal(record.data, undefined);
		}
	});

	test('an empty data array yields no items', async () => {
		server.reset();
		server.enqueue(searchPage({ records: [] }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams(),
		});

		assert.equal(items.length, 0);
	});

	test('unwrap runs before the limit truncates', async () => {
		// If the order inverted, Limit would slice the single-element list holding
		// the envelope and this would return 5 records instead of 2.
		server.reset();
		server.enqueue(searchPage({ records: records(5) }));

		const { items } = await runOperation({
			baseURL: server.url,
			params: searchParams({ limit: 2 }),
		});

		assert.equal(items.length, 2);
		assert.equal(json(items)[0].id, 'rec-1');
	});

	test('enrich responses are unwrapped the same way', async () => {
		server.reset();
		server.enqueue({
			body: {
				data: [
					{ type: 'ContactEnrich', id: 'c-1', attributes: { email: 'a@example.com' } },
					{ type: 'ContactEnrich', id: 'c-2', attributes: { email: 'b@example.com' } },
				],
			},
		});

		const { items } = await runOperation({
			baseURL: server.url,
			params: {
				resource: 'contact',
				operation: 'enrich',
				attributes:
					'{"matchPersonInput":[{"firstName":"Henry","lastName":"Schuck"}],"outputFields":["email"]}',
			},
		});

		assert.equal(items.length, 2);
		assert.equal(json(items)[1].attributes.email, 'b@example.com');
	});
});

describe('usage', () => {
	test('returns the payload as a single item without unwrapping', async () => {
		// Usage → Get declares no rootProperty, so the whole body is the item.
		server.reset();
		server.enqueue({
			body: { data: { type: 'Usage', attributes: { requestsThisMonth: 42, creditsUsed: 0 } } },
		});

		const { items } = await runOperation({
			baseURL: server.url,
			params: { resource: 'usage', operation: 'get' },
		});

		assert.equal(items.length, 1);
		assert.equal(json(items)[0].data.attributes.requestsThisMonth, 42);
	});
});
