import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';

/**
 * Wraps the user-supplied attributes in the JSON:API envelope the GTM API
 * expects: `{ "data": { "type": "<ResourceType>", "attributes": { ... } } }`.
 *
 * The `data.type` value is set per-operation in that operation's
 * `routing.request.body`, so this only has to fill in `attributes`.
 */
export async function applyAttributes(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const raw = this.getNodeParameter('attributes', '{}') as string | IDataObject | undefined;

	let parsed: IDataObject;

	if (raw === undefined || raw === null || raw === '') {
		parsed = {};
	} else if (typeof raw === 'string') {
		try {
			parsed = jsonParse<IDataObject>(raw);
		} catch {
			throw new NodeOperationError(this.getNode(), 'Attributes is not valid JSON', {
				description: 'Provide a JSON object, for example {"companyName":"ZoomInfo"}',
			});
		}
	} else {
		parsed = raw;
	}

	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), 'Attributes must be a JSON object', {
			description: 'Send the attributes only. The node adds the surrounding data/type envelope.',
		});
	}

	const body = (requestOptions.body ?? {}) as IDataObject;
	const data = (body.data ?? {}) as IDataObject;

	data.attributes = parsed;
	body.data = data;
	requestOptions.body = body;

	return requestOptions;
}
