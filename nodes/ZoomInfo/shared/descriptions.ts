import type { INodeProperties } from 'n8n-workflow';
import { applyAttributes } from './utils';

/** `displayOptions.show` shape used by the helpers below. */
export type Show = Record<string, string[] | boolean[]>;

/**
 * The `data.attributes` payload for a search or enrich operation. Each endpoint
 * accepts a different attribute set, so the node passes the object through
 * rather than modelling several hundred fields. The JSON:API envelope around it
 * is added by the node.
 */
export function attributesProperty(show: Show, hint: string): INodeProperties {
	return {
		displayName: 'Attributes',
		name: 'attributes',
		type: 'json',
		default: '{}',
		description:
			'The search or enrich attributes, as JSON. The node wraps this in the required data/type envelope.',
		hint,
		displayOptions: { show },
		routing: {
			send: {
				preSend: [applyAttributes],
			},
		},
	};
}

/**
 * Standard JSON:API paging for the search endpoints: `page[size]` caps a single
 * response at 100 records, and `page[number]` walks the pages.
 *
 * "Return All" continues while `meta.page.number < meta.page.total`. Per
 * ZoomInfo's schema, `meta.page.total` is "the total number of pages within the
 * current result set" — a *page* count. The *record* count is the adjacent
 * `meta.totalResults`. Paginating on that one instead would keep requesting
 * pages long past the end of the result set, so the two must not be swapped.
 */
export function paginationProperties(show: Show): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
			routing: {
				// Only `paginate` here. Setting `page[size]` through a static
				// `send.value` would apply whenever this property is *visible*
				// rather than when it is true, so it also fired for
				// "Return All: false" and collided with Limit below — which then
				// won purely by being later in this array. Page size for the
				// paginated case is set in the pagination request instead.
				send: {
					paginate: '={{ $value }}',
				},
				operations: {
					pagination: {
						type: 'generic',
						properties: {
							// The router shallow-merges this over the base request
							// options, so `qs` *replaces* the base query rather than
							// extending it. Anything a paged request still needs —
							// `sort` above all — has to be carried across from
							// `$request.qs` by hand, or it silently disappears the
							// moment Return All is switched on. On the Signal
							// resources, which have no sort, it resolves to nothing
							// and the parameter is dropped rather than sent empty.
							//
							// The page number is read back from the server's own
							// `meta.page.number`. The obvious `$pageCount` is not
							// available to a declarative `generic` block (it exists
							// only for function-style pagination), where it resolves
							// to undefined and asks for `page[number]=NaN`.
							request: {
								qs: {
									sort: '={{ $request.qs?.sort }}',
									'page[size]': 100,
									'page[number]': '={{ ($response.body?.meta?.page?.number ?? 0) + 1 }}',
								},
							},
							continue:
								'={{ ($response.body?.meta?.page?.number ?? 1) < ($response.body?.meta?.page?.total ?? 1) }}',
						},
					},
				},
			},
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			description: 'Max number of results to return',
			typeOptions: {
				minValue: 1,
				maxValue: 100,
			},
			displayOptions: {
				show: { ...show, returnAll: [false] },
			},
			routing: {
				send: {
					type: 'query',
					property: 'page[size]',
				},
				output: {
					maxResults: '={{ $value }}',
				},
			},
		},
	];
}

/**
 * The `sort` query parameter. Allowed field names differ per endpoint, so the
 * caller supplies them; a `-` prefix means descending.
 */
export function sortProperties(
	show: Show,
	options: Array<{ name: string; value: string }>,
	defaultField: string,
): INodeProperties[] {
	return [
		{
			displayName: 'Sort By',
			name: 'sortBy',
			type: 'options',
			default: defaultField,
			description: 'Field to sort the results by',
			options,
			displayOptions: { show },
		},
		{
			displayName: 'Sort Descending',
			name: 'sortDescending',
			type: 'boolean',
			default: true,
			description: 'Whether to sort in descending order instead of ascending',
			displayOptions: { show },
			routing: {
				send: {
					type: 'query',
					property: 'sort',
					value: '={{ ($value ? "-" : "") + $parameter.sortBy }}',
				},
			},
		},
	];
}
