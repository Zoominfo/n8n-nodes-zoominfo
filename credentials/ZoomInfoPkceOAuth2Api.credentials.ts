import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Authorization-code + PKCE auth for the ZoomInfo GTM API, and the node's only
 * credential: the user is redirected to the ZoomInfo login, signs in with their
 * own username and password, and the workflow then acts as that specific
 * ZoomInfo user, with their entitlements.
 *
 * Caution for unattended workflows: ZoomInfo rotates refresh tokens and each one
 * is single-use. If two executions of the same workflow refresh at the same
 * moment, one of them invalidates the other's token and the credential has to be
 * reconnected by hand. Keep concurrency at 1 on schedules that run unattended.
 *
 * A client-credentials credential was considered and dropped: it removes the
 * rotating-token hazard, but it also removes per-user attribution, and it
 * requires the `client_credentials` grant to be enabled on the DevPortal app —
 * which is not the default, so the common outcome was an `unauthorized_client`
 * dead end for anyone who picked it.
 */
export class ZoomInfoPkceOAuth2Api implements ICredentialType {
	name = 'zoomInfoPkceOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'ZoomInfo GTM PKCE OAuth2 API';

	icon: Icon = 'file:../icons/zoominfo.svg';

	documentationUrl = 'https://docs.zoominfo.com/docs/authorization-code-flow-pkce';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'pkce',
		},
		// Verified live against the gateway. ZoomInfo's own docs list two other
		// values for this endpoint and both are wrong: the prose guide gives
		// `/auth/authorize` (a bare 401, not an OAuth route) and the OpenAPI
		// security scheme gives `login.zoominfo.com` (only the Okta login UI that
		// /authorize redirects to).
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://api.zoominfo.com/gtm/oauth/v1/authorize',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://api.zoominfo.com/gtm/oauth/v1/token',
			required: true,
		},
		// Left empty deliberately. ZoomInfo grants *all* scopes selected for the
		// app in DevPortal when `scope` is omitted, whereas requesting a scope the
		// app does not hold fails the whole token request. An empty default is
		// therefore correct for every customer, regardless of their entitlements.
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];

	// Powers the "Test" button in the credential dialog. `GET /users/usage` is
	// the right probe: it consumes no credits, so checking a connection is free
	// however often a user clicks it.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.zoominfo.com/gtm/data/v1',
			url: '/users/usage',
		},
	};
}
