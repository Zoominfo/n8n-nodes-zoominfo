import type { INodeProperties } from 'n8n-workflow';
import { requestBodyProperty } from '../../shared/descriptions';

const showOnlyForCompany = {
	resource: ['company'],
};

export const companyDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForCompany,
		},
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search companies',
				description: 'Find companies matching a set of criteria',
				routing: {
					request: {
						method: 'POST',
						url: '/companies/search',
					},
				},
			},
			{
				name: 'Enrich',
				value: 'enrich',
				action: 'Enrich companies',
				description: 'Add ZoomInfo data to companies you already have',
				routing: {
					request: {
						method: 'POST',
						url: '/companies/enrich',
					},
				},
			},
		],
		default: 'search',
	},
	{
		...requestBodyProperty,
		displayOptions: {
			show: showOnlyForCompany,
		},
	},
];
