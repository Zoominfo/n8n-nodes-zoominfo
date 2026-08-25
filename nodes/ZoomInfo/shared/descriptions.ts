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
 * response at 100 records, and `page[number]` walks the pages. `meta.page`
 * reports the current page and the total, which is what drives "Return All".
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
				send: {
					paginate: '={{ $value }}',
					type: 'query',
					property: 'page[size]',
					value: '100',
				},
				operations: {
					pagination: {
						type: 'generic',
						properties: {
							continue:
								'={{ ($response.body?.meta?.page?.number ?? 1) < ($response.body?.meta?.page?.total ?? 1) }}',
							request: {
								qs: {
									'page[number]': '={{ $pageCount + 1 }}',
								},
							},
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
