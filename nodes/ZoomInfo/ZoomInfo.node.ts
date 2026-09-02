import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { contactDescription } from './resources/contact';
import { companyDescription } from './resources/company';
import { signalDescription } from './resources/signal';
import { usageDescription } from './resources/usage';

export class ZoomInfo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ZoomInfo',
		name: 'zoomInfo',
		// A single icon, deliberately: the mark is a self-contained red tile with a
		// white glyph, which reads on both the light and dark canvas. A `dark`
		// variant was declared previously but was byte-identical to this file,
		// which only implied a dark treatment that did not exist.
		icon: 'file:../../icons/zoominfo.svg',
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
				name: 'zoomInfoPkceOAuth2Api',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'https://api.zoominfo.com/gtm/data/v1',
			headers: {
				Accept: 'application/vnd.api+json',
				'Content-Type': 'application/vnd.api+json',
			},
		},
		properties: [
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
