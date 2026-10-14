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
 *
 * This is also the credential n8n's Managed OAuth targets. `clientId` and
 * `clientSecret` are deliberately not declared here: they are inherited from
 * `oAuth2Api`, which is the hook Managed OAuth fills in. On Cloud, n8n supplies
 * both from ZoomInfo's shared app and the user only sees a connect button;
 * everywhere else the user registers their own DevPortal app and enters the pair
 * by hand. Every other property stays `hidden` so neither path can misconfigure
 * an endpoint. See https://sites.n8n.io/managed-oauth-guidelines.
 */
export class ZoomInfoPkceOAuth2Api implements ICredentialType {
	name = 'zoomInfoPkceOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'ZoomInfo GTM PKCE OAuth2 API';

	// A single icon, deliberately, matching the node: the mark is a self-contained
	// red tile with a white glyph and reads on both canvases. n8n's lint rule and
	// the Managed OAuth example both show the `{ light, dark }` form, but pointing
	// both variants at this same file would only imply a dark treatment that does
	// not exist. See the note in nodes/ZoomInfo/ZoomInfo.node.ts.
	icon: Icon = 'file:../icons/zoominfo.svg';

	// The README, not ZoomInfo's PKCE page. This is the "Docs" link in the
	// credential dialog, so it should open what a setup actually trips over: both
	// n8n callback URLs, the rotating-refresh-token caveat, and why no scope is
	// sent. ZoomInfo's own page covers none of those, and two of its endpoint
	// values are wrong (see the Authorization URL note below).
	documentationUrl =
		'https://github.com/Zoominfo/n8n-nodes-zoominfo?tab=readme-ov-file#credentials';

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
		// Left empty deliberately, and not the same thing as "all scopes".
		// ZoomInfo grants exactly the scopes selected for the app in DevPortal when
		// `scope` is omitted, whereas requesting a scope the app does not hold fails
		// the whole token request. The app registration is therefore the ceiling: an
		// empty default asks for that set and nothing wider, which is correct both
		// for a customer's own app and for the shared app behind Managed OAuth.
		// Hard-coding a list here would only reintroduce the failure mode — one
		// entry the app lacks breaks every connect.
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
		// Root of the data and copilot APIs; the OAuth endpoints above stay on
		// ZoomInfo. n8n overrides this to route the node through n8n Connect.
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://api.zoominfo.com/gtm',
		},
	];

	// Powers the "Test" button in the credential dialog. `GET /lookup/search` is
	// the right probe: it consumes no credits, so checking a connection is free
	// however often a user clicks it, and unlike `/users/usage` it returns static
	// reference data rather than the account's credit usage.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}/data/v1',
			url: '/lookup/search',
		},
	};
}
