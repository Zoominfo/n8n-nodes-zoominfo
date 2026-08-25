import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { contactDescription } from './resources/contact';
import { companyDescription } from './resources/company';
import { signalDescription } from './resources/signal';
import { usageDescription } from './resources/usage';

export class ZoomInfo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ZoomInfo',
		name: 'zoomInfo',
		icon: { light: 'file:../../icons/zoominfo.svg', dark: 'file:../../icons/zoominfo.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the ZoomInfo GTM API',
		defaults: {
			name: 'ZoomInfo',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'zoomInfoOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['clientCredentials'],
					},
				},
			},
			{
				name: 'zoomInfoPkceOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['pkce'],
					},
				},
			},
		],
		requestDefaults: {
			baseURL: 'https://api.zoominfo.com/gtm/data/v1',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'Client Credentials',
						value: 'clientCredentials',
						description: 'Server-to-server auth. Recommended for unattended workflows.',
					},
					{
						name: 'Authorization Code (PKCE)',
						value: 'pkce',
						description: 'Act as a specific ZoomInfo user. Uses single-use refresh tokens.',
					},
				],
				default: 'clientCredentials',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Contact',
						value: 'contact',
					},
					{
						name: 'Company',
						value: 'company',
					},
					{
						name: 'Signal',
						value: 'signal',
					},
					{
						name: 'Usage',
						value: 'usage',
					},
				],
				default: 'contact',
			},
			...contactDescription,
			...companyDescription,
			...signalDescription,
			...usageDescription,
		],
	};
}
