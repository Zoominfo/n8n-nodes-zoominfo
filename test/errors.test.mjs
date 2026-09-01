/**
 * How ZoomInfo's two error shapes reach the user.
 *
 * The README documents both: gateway errors (`ZI*` codes, `{error: {...}}`) and
 * platform validation errors (`PFAPI*` codes, JSON:API `{title, detail, errors}`).
 * They surface differently, and the difference matters enough to pin down:
 *
 *  - Gateway errors put their message in `error.message`, which n8n lifts into
 *    the error description. The user sees the real reason.
 *  - Platform validation errors put it in `detail` / `errors[]`, which n8n does
 *    *not* lift. The headline is only "Bad request - please check your
 *    parameters", and the specifics are reachable on `error.context.data` —
 *    which is what n8n renders in the node's error detail panel.
 *
 * The second case is asserted deliberately rather than fixed. Making n8n lift
 * `detail` would mean setting `ignoreHttpStatusErrors` and re-throwing by hand,
 * which also disables n8n's automatic OAuth token refresh on 401 — a worse
 * trade than a less specific headline. The tests below encode the behaviour so
 * a future change to it is a visible decision.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

import { startMockServer } from './mock-server.mjs';
import { runOperation } from './harness.mjs';

let server;
before(async () => {
	server = await startMockServer();
});
after(async () => {
	await server.close();
});

const searchParams = {
	resource: 'contact',
	operation: 'search',
	attributes: '{}',
	sortBy: 'relevance',
	sortDescending: false,
	returnAll: false,
	limit: 10,
};

/** Runs one request that is expected to fail, and returns the thrown error. */
async function failWith(response, params = searchParams) {
	server.reset();
	server.enqueue(response);
	try {
		await runOperation({ baseURL: server.url, params });
	} catch (error) {
		return error;
	}
	throw new Error('expected the request to fail, but it succeeded');
}

describe('gateway errors (ZI* codes)', () => {
	test('429 surfaces the rate-limit reason and the status', async () => {
		const error = await failWith({
			status: 429,
			headers: { 'Retry-After': '30' },
			body: {
				error: {
					code: 'ZI4029',
					message: 'Rate limit exceeded',
					status: 429,
					requestId: 'req-2',
					retryable: true,
				},
			},
		});

		assert.equal(error.httpCode, '429');
		assert.match(error.description, /Rate limit exceeded/);
	});

	test('404 with ZI9998 surfaces the wrong-verb hint', async () => {
		// The gateway answers 404 rather than 405 when the HTTP verb is wrong, so
		// the body text is the only signal of what actually went wrong.
		const error = await failWith({
			status: 404,
			body: {
				error: {
					code: 'ZI9998',
					message: 'No static resource gtm/data/v1/contacts/search.',
					status: 404,
					requestId: 'req-3',
				},
			},
		});

		assert.equal(error.httpCode, '404');
		assert.match(error.description, /No static resource/);
	});

	test('403 surfaces the entitlement reason', async () => {
		const error = await failWith({
			status: 403,
			body: {
				error: { code: 'ZI1003', message: 'Insufficient scope for this endpoint', status: 403 },
			},
		});

		assert.equal(error.httpCode, '403');
		assert.match(error.description, /Insufficient scope/);
	});

	test('500 fails with the status rather than hanging', async () => {
		const error = await failWith({ status: 500, body: {} });
		assert.equal(error.httpCode, '500');
	});
});

describe('platform validation errors (PFAPI* codes)', () => {
	const body = {
		title: 'Validation failed',
		detail: 'topics must contain between 1 and 50 items',
		errors: [{ code: 'PFAPI0012', detail: 'topics is required' }],
	};

	test('the full validation body is reachable on the error', async () => {
		// This is the assertion that matters: the specifics are not lost, they
		// are on context.data, which n8n renders in the error detail panel.
		const error = await failWith({ status: 400, body });

		assert.equal(error.httpCode, '400');
		assert.deepEqual(error.context.data, body);
		assert.match(JSON.stringify(error.context.data), /between 1 and 50 items/);
	});

	test('the headline message is the generic 400 text', async () => {
		// Documents the known limitation. If n8n starts lifting `detail`, this
		// test fails and the README note should be updated to match.
		const error = await failWith({ status: 400, body });
		assert.match(error.message, /Bad request/);
	});
});

describe('authentication failures', () => {
	test('401 reports a credential problem, not a routing problem', async () => {
		const error = await failWith({
			status: 401,
			body: {
				error: { code: 'ZI1001', message: 'Invalid or expired token', status: 401 },
			},
		});

		// n8n owns this path: it attempts a token refresh and reports the
		// credential state. The assertion is that the user is pointed at their
		// credentials rather than at their parameters.
		assert.match(error.message, /credential|token/i);
	});
});
