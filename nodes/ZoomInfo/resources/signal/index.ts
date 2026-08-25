import type { INodeProperties } from 'n8n-workflow';
import { requestBodyProperty } from '../../shared/descriptions';

const showOnlyForSignal = {
	resource: ['signal'],
};

export const signalDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForSignal,
		},
		options: [
			{
				name: 'Search Intent',
				value: 'searchIntent',
				action: 'Search intent signals',
				description: 'Find companies showing research intent on given topics',
				routing: {
					request: {
						method: 'POST',
						url: '/intent/search',
					},
				},
			},
			{
				name: 'Search Scoops',
				value: 'searchScoops',
				action: 'Search scoops',
				description: 'Find ZoomInfo scoops, such as projects and org changes',
				routing: {
					request: {
						method: 'POST',
						url: '/scoops/search',
					},
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
					},
				},
			},
		],
		default: 'searchIntent',
	},
	{
		...requestBodyProperty,
		displayOptions: {
			show: showOnlyForSignal,
		},
	},
];
