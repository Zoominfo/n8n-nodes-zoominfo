/**
 * Metadata quality, checked against the description rather than a request.
 *
 * The node sets `usableAsTool: true`, so an AI agent chooses a resource and
 * operation from this metadata alone — it never sees the ZoomInfo docs. Missing
 * `action` or `description` text is invisible to a human clicking through the
 * UI but directly degrades tool selection. The same fields are what n8n Cloud
 * verification reviews, so these double as a publish checklist.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ZoomInfo } = require(join(root, 'dist/nodes/ZoomInfo/ZoomInfo.node.js'));

const { description } = new ZoomInfo();
const operationProperties = description.properties.filter((p) => p.name === 'operation');

describe('node metadata', () => {
	test('is usable as an AI tool', () => {
		assert.equal(description.usableAsTool, true);
	});

	test('has a description', () => {
		assert.ok(description.description?.length > 10, 'node description too short to be useful');
	});

	test('declares a subtitle so nodes are distinguishable on the canvas', () => {
		assert.ok(description.subtitle, 'no subtitle');
	});

	test('every credential is marked required', () => {
		for (const credential of description.credentials) {
			assert.equal(credential.required, true, `${credential.name} is not required`);
		}
	});
});

describe('operations', () => {
	test('every operation has an action and a description', () => {
		const missing = [];
		for (const property of operationProperties) {
			for (const option of property.options) {
				if (!option.action) missing.push(`${option.value}: no action`);
				if (!option.description) missing.push(`${option.value}: no description`);
			}
		}
		assert.deepEqual(missing, []);
	});

	test('every operation routes somewhere', () => {
		for (const property of operationProperties) {
			for (const option of property.options) {
				assert.ok(option.routing?.request?.url, `${option.value} has no routing.request.url`);
				assert.ok(option.routing?.request?.method, `${option.value} has no method`);
			}
		}
	});

	test('action text is distinct per operation', () => {
		// Two operations sharing an action string make them indistinguishable in
		// the actions panel and to an agent picking between them.
		const actions = operationProperties.flatMap((p) => p.options.map((o) => o.action));
		assert.equal(new Set(actions).size, actions.length, `duplicate actions: ${actions.join(', ')}`);
	});
});

describe('properties', () => {
	test('every value-input property has a description', () => {
		// Selectors (`options`) are excluded: they carry their meaning in their
		// individual options, which is n8n's own convention — the operation
		// options' action/description are asserted above. What matters here is
		// the fields a user or an agent has to fill in with a value.
		const missing = description.properties
			.filter((p) => p.type !== 'hidden' && p.type !== 'options' && !p.description)
			.map((p) => p.name);
		assert.deepEqual(missing, []);
	});

	test('every selector offers named options', () => {
		for (const property of description.properties.filter((p) => p.type === 'options')) {
			assert.ok(property.options?.length > 0, `${property.name} has no options`);
			for (const option of property.options) {
				assert.ok(option.name, `${property.name} has an option with no name`);
				assert.ok(option.value !== undefined, `${property.name}.${option.name} has no value`);
			}
		}
	});

	test('the Attributes fields carry an example hint', () => {
		// Attributes is free-form JSON; the hint is the only in-product guidance
		// on what belongs in it.
		const attributes = description.properties.filter((p) => p.name === 'attributes');
		assert.ok(attributes.length > 0, 'no attributes property found');
		for (const property of attributes) {
			assert.match(property.hint ?? '', /Example:/, 'attributes property has no example hint');
		}
	});

	test('Limit is bounded to the API maximum', () => {
		const limit = description.properties.find((p) => p.name === 'limit');
		assert.equal(limit.typeOptions.maxValue, 100, 'page[size] max is 100');
		assert.equal(limit.typeOptions.minValue, 1);
	});
});

describe('credentials', () => {
	test('the credential exposes a test request', () => {
		// Without this the "Test" button in the credential dialog does nothing.
		const pkg = require(join(root, 'package.json'));
		assert.equal(pkg.n8n.credentials.length, 1, 'expected exactly one declared credential');

		for (const file of pkg.n8n.credentials) {
			const mod = require(join(root, file));
			for (const Exported of Object.values(mod)) {
				const instance = new Exported();
				assert.ok(instance.test?.request?.url, `${instance.name} has no test.request.url`);
				assert.equal(
					instance.test.request.url,
					'/users/usage',
					`${instance.name} should probe the credit-free usage endpoint`,
				);
			}
		}
	});

	test('the node requires exactly the declared credential', () => {
		assert.deepEqual(
			description.credentials.map((c) => c.name),
			['zoomInfoPkceOAuth2Api'],
		);
	});
});
