import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';

/**
 * Merges the user-supplied JSON request body into the outgoing request.
 *
 * The GTM search/enrich endpoints take their whole query as a JSON body whose
 * field names vary per endpoint, so the node accepts the body verbatim instead
 * of guessing at a schema.
 */
export async function applyRequestBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const raw = this.getNodeParameter('requestBody', '{}') as string | IDataObject | undefined;

	let parsed: IDataObject;

	if (raw === undefined || raw === null || raw === '') {
		parsed = {};
	} else if (typeof raw === 'string') {
		try {
			parsed = jsonParse<IDataObject>(raw);
		} catch {
			throw new NodeOperationError(this.getNode(), 'Request body is not valid JSON', {
				description: 'Provide a JSON object, for example {"companyName":"ZoomInfo"}',
			});
		}
	} else {
		parsed = raw;
	}

	if (Array.isArray(parsed) || typeof parsed !== 'object') {
		throw new NodeOperationError(this.getNode(), 'Request body must be a JSON object');
	}

	requestOptions.body = {
		...((requestOptions.body as IDataObject) ?? {}),
		...parsed,
	};

	return requestOptions;
}
