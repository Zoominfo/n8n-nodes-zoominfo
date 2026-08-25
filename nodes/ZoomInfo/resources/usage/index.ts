import type { INodeProperties } from 'n8n-workflow';

const showOnlyForUsage = {
	resource: ['usage'],
};

export const usageDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForUsage,
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get API usage',
				// Consumes no credits, so it doubles as a cheap connectivity check.
				description: 'Get the API request and credit usage for your account',
				routing: {
					request: {
						method: 'GET',
						url: '/users/usage',
					},
				},
			},
		],
		default: 'get',
	},
];
