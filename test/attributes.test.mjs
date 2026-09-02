/**
 * The JSON:API envelope built by applyAttributes.
 *
 * Unit-level: applyAttributes is a preSend hook, so it is called directly rather
 * than through the router. scripts/smoke.mjs already covers the happy path and
 * the two obvious rejections; this file covers the edges that a hand-written
 * JSON field actually receives.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { applyAttributes } = require(join(root, 'dist/nodes/ZoomInfo/shared/utils.js'));

function context(value) {
	return {
		getNodeParameter: () => value,
		getNode: () => ({ name: 'ZoomInfo', type: 'zoomInfo', typeVersion: 1, position: [0, 0] }),
	};
}

/** Runs the hook with `value`, starting from a routed body carrying data.type. */
async function envelope(value, type = 'ContactSearch') {
	return await applyAttributes.call(context(value), {
		url: '/contacts/search',
		body: { data: { type } },
	});
}

describe('accepted input', () => {
	test('wraps a JSON string and preserves the routed data.type', async () => {
		const out = await envelope('{"companyName":"ZoomInfo"}');
		assert.deepEqual(out.body, {
			data: { type: 'ContactSearch', attributes: { companyName: 'ZoomInfo' } },
		});
	});

	test('accepts an already-parsed object', async () => {
		const out = await envelope({ jobTitle: 'engineer' });
		assert.deepEqual(out.body.data.attributes, { jobTitle: 'engineer' });
	});

	test('preserves nested objects and arrays inside attributes', async () => {
		// Real payloads nest: enrich takes matchPersonInput[] plus outputFields[].
		const input = {
			matchPersonInput: [{ firstName: 'Henry', lastName: 'Schuck', companyName: 'ZoomInfo' }],
			outputFields: ['id', 'email', 'jobTitle'],
		};
		const out = await envelope(JSON.stringify(input), 'ContactEnrich');
		assert.deepEqual(out.body.data.attributes, input);
		assert.equal(out.body.data.type, 'ContactEnrich');
	});

	test('treats an empty string as empty attributes', async () => {
		const out = await envelope('');
		assert.deepEqual(out.body.data.attributes, {});
	});

	test('treats a whitespace-only string as empty attributes', async () => {
		// Consistency: '' was already accepted, so '   ' erroring as invalid JSON
		// was a surprising difference for a field a user types into.
		const out = await envelope('   ');
		assert.deepEqual(out.body.data.attributes, {});
	});

	test('does not discard other keys already on the body', async () => {
		const out = await applyAttributes.call(context('{"a":1}'), {
			url: '/contacts/search',
			body: { data: { type: 'ContactSearch' }, meta: { keep: true } },
		});
		assert.deepEqual(out.body.meta, { keep: true });
	});
});

describe('rejected input', () => {
	for (const [label, value] of [
		['malformed JSON', '{not json'],
		['a JSON array', '[1,2,3]'],
		['a bare number', '5'],
		['a bare string', '"hello"'],
		['a bare boolean', 'true'],
		// typeof null is 'object', so this slipped through a plain typeof check
		// and produced `"attributes": null` in the request body.
		['a literal null', 'null'],
	]) {
		test(`rejects ${label}`, async () => {
			await assert.rejects(envelope(value), (error) => {
				assert.match(error.message, /Attributes (is not valid JSON|must be a JSON object)/);
				return true;
			});
		});
	}

	test('the malformed-JSON message points at the expected shape', async () => {
		await assert.rejects(envelope('{not json'), (error) => {
			assert.match(error.message, /valid JSON/i);
			assert.match(error.description, /companyName/);
			return true;
		});
	});
});
