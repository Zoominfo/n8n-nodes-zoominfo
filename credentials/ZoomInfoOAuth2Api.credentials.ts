import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Client-credentials (server-to-server) auth for the ZoomInfo GTM API.
 *
 * This is the recommended credential for n8n. ZoomInfo's authorization-code
 * flow issues *single-use, rotating* refresh tokens, which are hostile to a
 * workflow engine: two executions refreshing concurrently invalidate each
 * other and break the connection. Client credentials has no refresh token and
 * is safe under parallel execution. Use ZoomInfoOAuth2PkceApi only when you
 * specifically need to act on behalf of an interactive user.
 */
export class ZoomInfoOAuth2Api implements ICredentialType {
	name = 'zoomInfoOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'ZoomInfo GTM OAuth2 API';

	icon: Icon = { light: 'file:../icons/zoominfo.svg', dark: 'file:../icons/zoominfo.dark.svg' };

	documentationUrl = 'https://docs.zoominfo.com/docs/zoominfo-oauth-scopes';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
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
		// ZoomInfo accepts client credentials via HTTP Basic or body params, and
		// the header wins when both are sent. 'header' selects Basic.
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];
}
