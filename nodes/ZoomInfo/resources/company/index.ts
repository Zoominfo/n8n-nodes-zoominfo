import type { INodeProperties } from 'n8n-workflow';
import { attributesProperty, paginationProperties, sortProperties } from '../../shared/descriptions';

const showForCompany = { resource: ['company'] };
const showForSearch = { resource: ['company'], operation: ['search'] };
const showForEnrich = { resource: ['company'], operation: ['enrich'] };

const unwrapData = {
	postReceive: [
		{
			type: 'rootProperty' as const,
			properties: { property: 'data' },
		},
	],
};

export const companyDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showForCompany },
		options: [
			{
				name: 'Enrich',
				value: 'enrich',
				action: 'Enrich companies',
				description: 'Add ZoomInfo data to companies you already have',
				routing: {
					request: {
						method: 'POST',
						url: '/companies/enrich',
						body: { data: { type: 'CompanyEnrich' } },
					},
					output: unwrapData,
				},
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search companies',
				description: 'Find companies matching a set of criteria',
				routing: {
					request: {
						method: 'POST',
						url: '/companies/search',
						body: { data: { type: 'CompanySearch' } },
					},
					output: unwrapData,
				},
			},
		],
		default: 'search',
	},
	attributesProperty(showForSearch, 'Example: {"companyName": "ZoomInfo"}'),
	attributesProperty(
		showForEnrich,
		'Example: {"matchCompanyInput": [{"companyName": "ZoomInfo"}], "outputFields": ["id", "name", "website"]}',
	),
	...sortProperties(
		showForSearch,
		[
			{ name: 'Employee Count', value: 'employeeCount' },
			{ name: 'Name', value: 'name' },
			{ name: 'Revenue', value: 'revenue' },
		],
		'revenue',
	),
	...paginationProperties(showForSearch),
];
