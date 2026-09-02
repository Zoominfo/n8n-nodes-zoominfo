/**
 * Test harness that drives the *real* n8n declarative router against the
 * compiled node in dist/.
 *
 * Why this exists: scripts/smoke.mjs only introspects the static node
 * description. It cannot catch anything that goes wrong while the router turns
 * that description into an HTTP request — wrong query serialization, a
 * pagination loop that never terminates, postReceive actions running in the
 * wrong order. Those are the failures that reach production, so the tests need
 * the actual router (n8n-core's RoutingNode), the actual expression evaluator,
 * and an actual socket.
 *
 * Auth is deliberately stubbed. n8n's OAuth2 implementation is n8n's code, not
 * ours; what we own is the *credential configuration*, and that is verified for
 * real by scripts/live.mjs doing a live token exchange. Here the stub records
 * which credential the router selected so tests can assert the wiring.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Both set before n8n-core loads. Left to itself, n8n generates an encryption
// key and writes it to ~/.n8n/config — tests must not touch the developer's real
// n8n config directory, so point the whole user folder at a temp dir. The path
// is fixed rather than unique: node --test runs one process per test file, and a
// unique dir each would leave a pile of them behind in the temp directory.
const userFolder = join(tmpdir(), 'n8n-nodes-zoominfo-test');
mkdirSync(userFolder, { recursive: true });
process.env.N8N_USER_FOLDER ??= userFolder;
process.env.N8N_ENCRYPTION_KEY ??= 'n8n-nodes-zoominfo-test-key';

// Loaded via require, not import: n8n-workflow's ESM build uses extensionless
// relative imports, which Node's ESM resolver rejects. The CJS build is fine.
const { Workflow } = require('n8n-workflow');
const { ExecuteContext, RoutingNode } = require('n8n-core');

// Derived from package.json rather than hardcoded: n8n forms a node's type as
// `<package name>.<node name>`, so a package rename has to reach here too.
const { name: PACKAGE_NAME } = require(join(root, 'package.json'));
const NODE_TYPE = `${PACKAGE_NAME}.zoomInfo`;

/** Loads the compiled node. Throws a pointed message if dist/ is stale. */
function loadNodeType() {
	const path = join(root, 'dist/nodes/ZoomInfo/ZoomInfo.node.js');
	let mod;
	try {
		mod = require(path);
	} catch (error) {
		throw new Error(`could not load ${path} — run "npm run build" first (${error.message})`);
	}
	return new mod.ZoomInfo();
}

/**
 * Minimal ICredentialsHelper.
 *
 * For an oAuth2Api-derived credential n8n never calls `authenticate` — it takes
 * its own OAuth2 path and reads `oauthTokenData.access_token` off the decrypted
 * data, which is why `getDecrypted` returns a fake token. That path stamps the
 * Authorization header for real, so tests can assert it.
 *
 * `getDecrypted` also receives the credential type the router selected, which is
 * recorded into `selected` so tests can assert the credential wiring.
 */
function credentialsHelper(selected) {
	return {
		getParentTypes: () => ['oAuth2Api'],
		isCredentialUsableByNode: () => true,
		async authenticate(_credentials, _typeName, requestOptions) {
			return requestOptions;
		},
		async preAuthentication() {
			return undefined;
		},
		async runPreAuthentication() {
			return undefined;
		},
		async getCredentials() {
			return {};
		},
		async getDecrypted(_additionalData, _nodeCredentials, type) {
			selected.push(type);
			return { oauthTokenData: { access_token: 'test-token' } };
		},
		async updateCredentials() {},
		async updateCredentialsOauthTokenData() {},
		getCredentialsProperties: () => [],
	};
}

/**
 * Runs one operation through the router.
 *
 * @param {object} opts
 * @param {string} opts.baseURL          Mock server URL; replaces requestDefaults.baseURL.
 * @param {object} opts.params           Node parameters (resource, operation, attributes, …).
 * @param {object[]} [opts.input]        Input items; defaults to one empty item.
 * @returns {Promise<{items: object[], credentialTypes: string[]}>}
 */
export async function runOperation({ baseURL, params, input = [{ json: {} }] }) {
	const nodeType = loadNodeType();

	// Point the node at the mock server. loadNodeType() re-instantiates per call,
	// so this cannot leak between tests.
	nodeType.description.requestDefaults = {
		...nodeType.description.requestDefaults,
		baseURL,
	};

	const node = {
		id: 'zoominfo-test-node',
		name: 'ZoomInfo',
		type: NODE_TYPE,
		typeVersion: 1,
		position: [0, 0],
		parameters: params,
		credentials: {
			zoomInfoPkceOAuth2Api: { id: 'cred-1', name: 'ZoomInfo test credential (PKCE)' },
		},
	};

	const nodeTypes = {
		getByName: () => nodeType,
		getByNameAndVersion: () => nodeType,
		getKnownTypes: () => ({}),
	};

	const workflow = new Workflow({
		id: 'test-workflow',
		name: 'test',
		nodes: [node],
		connections: {},
		active: false,
		nodeTypes,
	});

	const credentialTypes = [];
	const additionalData = {
		credentialsHelper: credentialsHelper(credentialTypes),
		restApiUrl: '',
		instanceBaseUrl: '',
		formWaitingBaseUrl: '',
		webhookBaseUrl: '',
		webhookWaitingBaseUrl: '',
		webhookTestBaseUrl: '',
		currentNodeParameters: params,
		executionTimeoutTimestamp: undefined,
		userId: 'test-user',
		variables: {},
		logAiEvent: () => {},
		startRunnerTask: async () => {
			throw new Error('task runner not available in tests');
		},
	};

	const runExecutionData = { resultData: { runData: {} } };
	const inputData = { main: [input] };
	const executeData = {
		node,
		data: inputData,
		source: null,
	};

	const context = new ExecuteContext(
		workflow,
		node,
		additionalData,
		'manual',
		runExecutionData,
		0,
		[],
		inputData,
		executeData,
		[],
	);

	const routingNode = new RoutingNode(context, nodeType);
	const output = await routingNode.runNode();

	return {
		items: output?.[0] ?? [],
		credentialTypes,
	};
}

/** Convenience: the JSON payload of each returned item. */
export function json(items) {
	return items.map((item) => item.json);
}
