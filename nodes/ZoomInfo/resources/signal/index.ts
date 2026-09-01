import type { INodeProperties } from 'n8n-workflow';
import { attributesProperty, paginationProperties } from '../../shared/descriptions';

const showForSignal = { resource: ['signal'] };
const showForIntent = { resource: ['signal'], operation: ['searchIntent'] };
const showForScoops = { resource: ['signal'], operation: ['searchScoops'] };
const showForNews = { resource: ['signal'], operation: ['searchNews'] };

const unwrapData = {
	postReceive: [
		{
			type: 'rootProperty' as const,
			properties: { property: 'data' },
		},
	],
};

export const signalDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showForSignal },
		options: [
			{
				name: 'Search Intent',
				value: 'searchIntent',
				action: 'Search intent signals',
				description: 'Find companies researching given topics',
				routing: {
					request: {
						method: 'POST',
						url: '/intent/search',
						body: { data: { type: 'IntentSearch' } },
					},
					output: unwrapData,
				},
			},
			{
				name: 'Search News',
				value: 'searchNews',
				action: 'Search news',
				description: 'Find news articles about companies',
				routing: {
					request: {
						method: 'POST',
						url: '/news/search',
						body: { data: { type: 'NewsSearch' } },
					},
					output: unwrapData,
				},
			},
			{
				name: 'Search Scoops',
				value: 'searchScoops',
				action: 'Search scoops',
				description: 'Find scoops, such as projects and org changes',
				routing: {
					request: {
						method: 'POST',
						url: '/scoops/search',
						body: { data: { type: 'ScoopSearch' } },
					},
					output: unwrapData,
				},
			},
		],
		default: 'searchIntent',
	},
	// Intent requires between 1 and 50 topics.
	attributesProperty(
		showForIntent,
		'Example: {"topics": ["data enrichment", "sales intelligence"]}',
	),
	attributesProperty(showForScoops, 'Example: {"companyName": "ZoomInfo"}'),
	// News takes all-optional inputs, but at least one is required.
	attributesProperty(showForNews, 'Example: {"companyName": "ZoomInfo"}'),
	...paginationProperties({
		resource: ['signal'],
		operation: ['searchIntent', 'searchNews', 'searchScoops'],
	}),
];
