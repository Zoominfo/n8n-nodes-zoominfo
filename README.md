# n8n-nodes-zoominfo

An [n8n](https://n8n.io) community node for the **ZoomInfo GTM API** — contact and
company search and enrichment, intent signals, scoops, news, and usage reporting.

[n8n](https://n8n.io) is a [fair-code licensed](https://docs.n8n.io/reference/license/)
workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Development](#development)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/),
using `n8n-nodes-zoominfo` as the package name.

## Credentials

You need a ZoomInfo GTM API application, created in the ZoomInfo DevPortal. The node
ships two credential types.

### ZoomInfo GTM OAuth2 API (client credentials) — recommended

Server-to-server auth with a client ID and secret. Use this for anything unattended.

### ZoomInfo GTM PKCE OAuth2 API (authorization code + PKCE)

Use this only when a workflow has to act as a specific ZoomInfo user. Your
`redirect_uri` must be pre-registered in the DevPortal and match exactly.

> **Why client credentials is the default.** ZoomInfo issues **single-use, rotating**
> refresh tokens on the authorization-code flow: every refresh invalidates the
> previous token. If two executions of the same workflow refresh concurrently, one
> kills the other's token and the credential must be reconnected by hand. Client
> credentials has no refresh token and is safe under parallel execution.

### Scopes

Both credentials deliberately send **no** `scope` parameter. ZoomInfo grants every
scope selected for your app in the DevPortal when `scope` is omitted, whereas
requesting a scope your app does not hold fails the entire token request. Manage
entitlements in the DevPortal, not here.

## Operations

Base URL: `https://api.zoominfo.com/gtm/data/v1`

| Resource | Operation | Endpoint |
| --- | --- | --- |
| Contact | Search | `POST /contacts/search` |
| Contact | Enrich | `POST /contacts/enrich` |
| Company | Search | `POST /companies/search` |
| Company | Enrich | `POST /companies/enrich` |
| Signal | Search Intent | `POST /intent/search` |
| Signal | Search Scoops | `POST /scoops/search` |
| Signal | Search News | `POST /news/search` |
| Usage | Get | `GET /users/usage` |

`Usage → Get` consumes no credits, which makes it a good first call for verifying
that a credential works.

### Request Body

Each search and enrich operation takes its query as a **Request Body** JSON field
that is passed through to ZoomInfo verbatim, because the accepted fields differ per
endpoint. See the [ZoomInfo API docs](https://docs.zoominfo.com/) for what each
operation accepts. Example for `Contact → Search`:

```json
{ "companyName": "ZoomInfo", "jobTitle": "engineer" }
```

Typed per-operation fields will replace this as each endpoint's schema is confirmed
against the API — see [Roadmap](#roadmap).

### Error responses

ZoomInfo returns two different error shapes depending on which layer rejects the
request, and workflow error handling should expect both:

- **Gateway** (`ZI*` codes; 401/403/429): `{"error": {code, message, status, requestId, retryable}}`
- **Platform validation** (`PFAPI*` codes; 400): JSON:API style `{"title", "detail", "errors": [...]}`

A `404` with code `ZI9998` and `"No static resource ..."` means the **HTTP verb** is
wrong, not the path — the gateway does not return `405`.

## Development

```bash
npm install
npm run dev     # runs n8n locally with this node linked
npm run lint
npm run build
```

Releases publish from CI via `.github/workflows/publish.yml` with npm provenance;
n8n does not accept verified nodes published from a local machine.

## Roadmap

- Typed request fields per operation, replacing the pass-through JSON body
- Pagination support once the paging contract is confirmed for each search endpoint
- `test` blocks on both credentials, using `GET /users/usage` as the check
- Official ZoomInfo brand icons (current icons are placeholders)

## Compatibility

Tested against n8n nodes API version 1. Requires Node.js 20 or later.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [ZoomInfo API documentation](https://docs.zoominfo.com/)

## License

[MIT](LICENSE)
