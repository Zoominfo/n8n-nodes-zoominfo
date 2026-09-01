/**
 * Mock HTTP server for the routing tests.
 *
 * Deliberately a real socket-level server rather than a stubbed n8n helper. The
 * declarative router builds `qs` with lodash `set`, so `page[size]` becomes a
 * *nested* object (`{page: {size: 100}}`) while the pagination block's
 * `page[number]` stays a literal key. Whether those two end up identical on the
 * wire depends on the param serializer n8n installs, which is not something we
 * can assert by inspecting the request options object. Only a real request
 * answers it, so the tests read `rawQuery` off this server.
 *
 * Dependency-free, matching scripts/smoke.mjs.
 */
import { createServer } from 'node:http';

/**
 * Starts a server on an ephemeral port.
 *
 * Responses are taken from a FIFO queue. Running the queue dry is a test bug
 * rather than a scenario worth modelling, so it answers 500 with a marker body
 * that shows up clearly in a failure message.
 */
export async function startMockServer() {
	/** @type {Array<{method: string, path: string, rawQuery: string, query: URLSearchParams, headers: Record<string,string>, body: unknown}>} */
	const requests = [];
	/** @type {Array<{status?: number, body?: unknown, headers?: Record<string,string>}>} */
	let queue = [];

	const server = createServer((req, res) => {
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			const raw = Buffer.concat(chunks).toString('utf8');
			// req.url keeps the query string exactly as it went over the wire,
			// which is the whole point of this server.
			const [path, rawQuery = ''] = req.url.split('?');

			let body;
			if (raw) {
				try {
					body = JSON.parse(raw);
				} catch {
					body = raw;
				}
			}

			requests.push({
				method: req.method,
				path,
				rawQuery,
				query: new URLSearchParams(rawQuery),
				headers: req.headers,
				body,
			});

			const next = queue.shift() ?? {
				status: 500,
				body: { error: { message: 'mock server queue exhausted' } },
			};

			res.writeHead(next.status ?? 200, {
				'Content-Type': 'application/vnd.api+json',
				...(next.headers ?? {}),
			});
			res.end(JSON.stringify(next.body ?? {}));
		});
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();

	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		/** Queue one or more responses, consumed in order. */
		enqueue(...responses) {
			queue.push(...responses);
		},
		reset() {
			requests.length = 0;
			queue = [];
		},
		async close() {
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

/**
 * A JSON:API search response.
 *
 * Mirrors what the GTM API returns for search endpoints. Two separate totals
 * live in `meta`, and they mean different things — confusing them silently
 * breaks "Return All", so both are modelled here:
 *
 *   meta.page.total   total number of *pages* in the result set
 *   meta.page.number  the current page
 *   meta.totalResults total number of matching *records*
 *
 * `totalResults` defaults to something deliberately unequal to `total` so a test
 * that reads the wrong field fails loudly rather than passing by coincidence.
 */
export function searchPage({ records, number = 1, total = 1, totalResults }) {
	return {
		body: {
			data: records,
			meta: {
				page: { number, size: records.length, total },
				totalResults: totalResults ?? total * 1000 + 7,
			},
		},
	};
}

/** `count` records with stable, greppable ids. */
export function records(count, prefix = 'rec') {
	return Array.from({ length: count }, (_, i) => ({
		type: 'Contact',
		id: `${prefix}-${i + 1}`,
		attributes: { name: `${prefix} ${i + 1}` },
	}));
}
