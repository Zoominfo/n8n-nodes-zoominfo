/**
 * The example workflows in README.md must stay importable.
 *
 * n8n's verification guidelines require example workflows in the documentation,
 * and a broken example is worse than none — a reviewer or user pastes it, it
 * fails, and the node looks broken. These examples reference parameter names,
 * resource/operation values and credential names that all live in the node
 * description, so a rename anywhere else in the codebase can silently invalidate
 * them. This test fails when that happens.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ZoomInfo } = require(join(root, 'dist/nodes/ZoomInfo/ZoomInfo.node.js'));

const { description } = new ZoomInfo();
const NODE_TYPE = 'n8n-nodes-zoominfo.zoomInfo';

const knownParameters = new Set(description.properties.map((p) => p.name));
const knownCredentials = new Set(description.credentials.map((c) => c.name));

/** Every ```json block in the README, parsed. */
const blocks = [...readFileSync(join(root, 'README.md'), 'utf8').matchAll(/```json\n([\s\S]*?)```/g)]
	.map((match, index) => ({ index, raw: match[1] }));

/** Just the blocks that are n8n workflow exports. */
function workflows() {
	return blocks
		.map((block) => {
			try {
				return { ...block, json: JSON.parse(block.raw) };
			} catch {
				return null;
			}
		})
		.filter((block) => block && Array.isArray(block.json?.nodes));
}

/** Every ZoomInfo node across every example workflow. */
function zoomInfoNodes() {
	return workflows().flatMap(({ index, json }) =>
		json.nodes.filter((n) => n.type === NODE_TYPE).map((node) => ({ block: index, node })),
	);
}

describe('README json blocks', () => {
	test('every json block parses', () => {
		const broken = [];
		for (const { index, raw } of blocks) {
			try {
				JSON.parse(raw);
			} catch (error) {
				broken.push(`block ${index}: ${error.message}`);
			}
		}
		assert.deepEqual(broken, []);
	});

	test('the README contains importable example workflows', () => {
		// Guards against the examples being deleted: verification requires them.
		assert.ok(workflows().length >= 3, `expected at least 3 example workflows, got ${workflows().length}`);
		assert.ok(zoomInfoNodes().length >= 3, 'example workflows contain no ZoomInfo nodes');
	});
});

describe('example workflows match the node', () => {
	test('every parameter name exists on the node', () => {
		const unknown = [];
		for (const { block, node } of zoomInfoNodes()) {
			for (const name of Object.keys(node.parameters)) {
				if (!knownParameters.has(name)) unknown.push(`block ${block}, "${node.name}": ${name}`);
			}
		}
		assert.deepEqual(unknown, []);
	});

	test('every resource and operation is a real option', () => {
		const resourceProperty = description.properties.find((p) => p.name === 'resource');

		for (const { block, node } of zoomInfoNodes()) {
			const { resource, operation } = node.parameters;
			const label = `block ${block}, "${node.name}"`;

			assert.ok(
				resourceProperty.options.some((o) => o.value === resource),
				`${label}: unknown resource "${resource}"`,
			);

			// Operation options are declared per resource, so find the selector
			// shown for this one.
			const operationProperties = description.properties.filter(
				(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
			);
			assert.ok(
				operationProperties.some((p) => p.options.some((o) => o.value === operation)),
				`${label}: "${operation}" is not an operation of "${resource}"`,
			);
		}
	});

	test('every credential reference is a credential the node declares', () => {
		const bad = [];
		for (const { block, node } of zoomInfoNodes()) {
			for (const name of Object.keys(node.credentials ?? {})) {
				if (!knownCredentials.has(name)) bad.push(`block ${block}, "${node.name}": ${name}`);
			}
		}
		assert.deepEqual(bad, []);
	});

	test('attributes payloads are valid JSON', () => {
		// The Attributes field is a JSON string inside the workflow JSON, so it is
		// double-encoded and easy to break by hand.
		for (const { block, node } of zoomInfoNodes()) {
			const { attributes } = node.parameters;
			if (attributes === undefined) continue;
			assert.doesNotThrow(
				() => JSON.parse(attributes),
				`block ${block}, "${node.name}": attributes is not valid JSON`,
			);
		}
	});
});
