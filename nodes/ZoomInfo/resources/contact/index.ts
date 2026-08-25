import type { INodeProperties } from 'n8n-workflow';
import { requestBodyProperty } from '../../shared/descriptions';

const showOnlyForContact = {
	resource: ['contact'],
};

export const contactDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForContact,
		},
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search contacts',
				description: 'Find contacts matching a set of criteria',
				routing: {
					request: {
						method: 'POST',
						url: '/contacts/search',
					},
				},
			},
			{
				name: 'Enrich',
				value: 'enrich',
				action: 'Enrich contacts',
				description: 'Add ZoomInfo data to contacts you already have',
				routing: {
					request: {
						method: 'POST',
						url: '/contacts/enrich',
					},
				},
			},
		],
		default: 'search',
	},
	{
		...requestBodyProperty,
		displayOptions: {
			show: showOnlyForContact,
		},
	},
];
