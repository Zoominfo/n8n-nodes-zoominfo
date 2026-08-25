import type { INodeProperties } from 'n8n-workflow';
import { applyRequestBody } from './utils';

/**
 * The request body shared by every search and enrich operation. ZoomInfo's GTM
 * endpoints each take a different set of body fields, so the node passes the
 * body through rather than modelling every field.
 */
export const requestBodyProperty: INodeProperties = {
	displayName: 'Request Body',
	name: 'requestBody',
	type: 'json',
	default: '{}',
	description:
		'JSON body to send to ZoomInfo. See the ZoomInfo GTM API docs for the fields each operation accepts.',
	hint: 'Example: {"companyName": "ZoomInfo", "jobTitle": "engineer"}',
	routing: {
		send: {
			preSend: [applyRequestBody],
		},
	},
};
