import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { companyDescription } from './resources/company';
import { contactDescription } from './resources/contact';
import { lookupDescription } from './resources/lookup';
import { signalDescription } from './resources/signal';
import { usageDescription } from './resources/usage';
import { BASE_URL, getLookupOptions } from './shared/utils';

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
		// 1.1: requests go to the credential's base URL instead of a hardcoded host
		version: [1, 1.1],
		defaultVersion: 1.1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Connect verified B2B company and contact intelligence to research accounts, find buyers, and act on buying signals.',
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
			baseURL: BASE_URL,
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
						name: 'Company',
						value: 'company',
					},
					{
						name: 'Contact',
						value: 'contact',
					},
					{
						name: 'Lookup',
						value: 'lookup',
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
			...companyDescription,
			...contactDescription,
			...lookupDescription,
			...signalDescription,
			...usageDescription,
		],
	};

	methods = {
		loadOptions: {
			async getDepartments(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getLookupOptions.call(this, 'departments');
			},
			async getIntentTopics(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getLookupOptions.call(this, 'intent-topics');
			},
		},
	};
}
