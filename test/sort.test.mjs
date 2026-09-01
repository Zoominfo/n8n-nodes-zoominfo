/**
 * The `sort` query parameter.
 *
 * Sort is built from two properties: `sortBy` carries no routing of its own and
 * is read back through `$parameter.sortBy` inside `sortDescending`'s routing
 * expression. That indirection is easy to break — a rename of either property,
 * or dropping `sortDescending`'s routing, silently stops sorting the results
 * while the workflow still succeeds.
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

async function sortFor({ resource, operation, sortBy, sortDescending }) {
	server.reset();
	server.enqueue(searchPage({ records: records(1) }));

	await runOperation({
		baseURL: server.url,
		params: {
			resource,
			operation,
			attributes: '{}',
			returnAll: false,
			limit: 10,
			sortBy,
			sortDescending,
		},
	});

	return server.requests[0].query.get('sort');
}

describe('contact search', () => {
	test('ascending sends the bare field name', async () => {
		const sort = await sortFor({
			resource: 'contact',
			operation: 'search',
			sortBy: 'lastName',
			sortDescending: false,
		});
		assert.equal(sort, 'lastName');
	});

	test('descending prefixes the field with a hyphen', async () => {
		const sort = await sortFor({
			resource: 'contact',
			operation: 'search',
			sortBy: 'lastName',
			sortDescending: true,
		});
		assert.equal(sort, '-lastName');
	});

	test('resolves $parameter.sortBy rather than hardcoding a default', async () => {
		// Guards the cross-property reference: if $parameter.sortBy stopped
		// resolving, this would come back as "-undefined" or just "-".
		const sort = await sortFor({
			resource: 'contact',
			operation: 'search',
			sortBy: 'contactAccuracyScore',
			sortDescending: true,
		});
		assert.equal(sort, '-contactAccuracyScore');
	});
});

describe('company search', () => {
	test('uses the company field set', async () => {
		const sort = await sortFor({
			resource: 'company',
			operation: 'search',
			sortBy: 'employeeCount',
			sortDescending: true,
		});
		assert.equal(sort, '-employeeCount');
	});
});

describe('resources without sort', () => {
	for (const operation of ['searchIntent', 'searchNews', 'searchScoops']) {
		test(`signal.${operation} sends no sort parameter`, async () => {
			server.reset();
			server.enqueue(searchPage({ records: records(1) }));

			await runOperation({
				baseURL: server.url,
				params: {
					resource: 'signal',
					operation,
					attributes: '{}',
					returnAll: false,
					limit: 10,
				},
			});

			assert.equal(server.requests[0].query.get('sort'), null);
		});
	}
});
