import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Authorization-code + PKCE auth for the ZoomInfo GTM API, for when a workflow
 * must act as a specific ZoomInfo user rather than as the application.
 *
 * Caution: ZoomInfo rotates refresh tokens and each one is single-use. If two
 * executions of the same workflow refresh at the same moment, one of them
 * invalidates the other's token and the credential has to be reconnected by
 * hand. Prefer ZoomInfoOAuth2Api (client credentials) for unattended work.
 */
export class ZoomInfoPkceOAuth2Api implements ICredentialType {
	name = 'zoomInfoPkceOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'ZoomInfo GTM PKCE OAuth2 API';

	icon: Icon = { light: 'file:../icons/zoominfo.svg', dark: 'file:../icons/zoominfo.dark.svg' };

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
		// See the note in ZoomInfoOAuth2Api: omitting `scope` grants every scope
		// the DevPortal app holds, which is what we want.
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
}
