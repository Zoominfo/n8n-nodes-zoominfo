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

### ZoomInfo GTM PKCE OAuth2 API (authorization code + PKCE) — default

Users sign in to ZoomInfo and approve access. Note that ZoomInfo's PKCE flow is a
**confidential** client: unlike most public-client PKCE implementations, the token
exchange still requires your `client_secret` alongside the `code_verifier`. n8n sends
both, so fill in Client ID *and* Client Secret.

Add n8n's OAuth callback to the **Sign-in Redirect URIs** list on your DevPortal app —
it must match exactly on both the authorize and token calls:

```
http://localhost:5678/rest/oauth2-credential/callback
```

Replace the host with your n8n instance URL when not running locally.

> **One caveat worth knowing.** ZoomInfo issues **single-use, rotating** refresh tokens
> on this flow: every refresh invalidates the previous token. If two executions of the
> same workflow refresh concurrently, one kills the other's token and the credential
> must be reconnected by hand. If you hit that, the client-credentials credential below
> avoids it entirely.

### ZoomInfo GTM OAuth2 API (client credentials)

Server-to-server auth with no user sign-in, and no refresh token to invalidate.

### Scopes

Both credentials deliberately send **no** `scope` parameter. ZoomInfo grants every
scope selected for your app in the DevPortal when `scope` is omitted, whereas
requesting a scope your app does not hold fails the entire token request. Manage
entitlements in the DevPortal, not here.

## Operations

Base URL: `https://api.zoominfo.com/gtm/data/v1`

| Resource | Operation | Endpoint | Body `type` |
| --- | --- | --- | --- |
| Contact | Search | `POST /contacts/search` | `ContactSearch` |
| Contact | Enrich | `POST /contacts/enrich` | `ContactEnrich` |
| Company | Search | `POST /companies/search` | `CompanySearch` |
| Company | Enrich | `POST /companies/enrich` | `CompanyEnrich` |
| Signal | Search Intent | `POST /intent/search` | `IntentSearch` |
| Signal | Search Scoops | `POST /scoops/search` | `ScoopSearch` |
| Signal | Search News | `POST /news/search` | `NewsSearch` |
| Usage | Get | `GET /users/usage` | — |

`Usage → Get` consumes no credits, which makes it a good first call for verifying that
a credential works. Search operations consume no credits either, though every request
counts against your rate limits.

### Attributes

The GTM API is JSON:API shaped: every search and enrich request is wrapped in a
`data` object carrying a fixed resource `type` and an `attributes` payload. **The node
adds that envelope for you** — the *Attributes* field takes the inner attributes only:

```json
{ "companyName": "ZoomInfo", "jobTitle": "engineer" }
```

becomes

```json
{ "data": { "type": "ContactSearch", "attributes": { "companyName": "ZoomInfo", "jobTitle": "engineer" } } }
```

Attributes are passed through as-is because each endpoint accepts a different set —
`Contact → Search` alone takes over a hundred. See the
[API reference](https://docs.zoominfo.com/reference/searchinterface_searchcontact) for
what each operation supports. `Enrich` operations require `matchPersonInput` (or
`matchCompanyInput`) plus `outputFields`, and accept at most 25 records per call.

### Pagination and sorting

Search operations expose **Limit** (mapped to `page[size]`, max 100) and **Return All**,
which walks `page[number]` until `meta.page.number` reaches `meta.page.total`. Responses
are unwrapped to the `data` array, so each record arrives as its own n8n item.

Contact and Company search also expose **Sort By** and **Sort Descending**, which
combine into the `sort` query parameter using the field names each endpoint allows.

### Error responses

ZoomInfo returns two different error shapes depending on which layer rejects the
request, and workflow error handling should expect both:

- **Gateway** (`ZI*` codes; 401/403/429): `{"error": {code, message, status, requestId, retryable}}`
- **Platform validation** (`PFAPI*` codes; 400): JSON:API style `{"title", "detail", "errors": [...]}`

A `404` with code `ZI9998` and `"No static resource ..."` means the **HTTP verb** is
wrong, not the path — the gateway does not return `405`.

Rate limits are evaluated against per-second, per-hour and per-day windows at once.
Every response carries `X-RateLimit-*` headers, and `429` responses include
`Retry-After`.

## Development

```bash
npm install
npm run dev     # runs n8n locally with this node linked
npm run lint
npm run smoke   # builds, then checks routing, credentials and the JSON:API envelope
npm run build
```

Releases publish from CI via `.github/workflows/publish.yml` with npm provenance;
n8n does not accept verified nodes published from a local machine.

## Roadmap

- Typed request fields for the most common attributes, replacing the JSON pass-through
- Remaining endpoints: lookup, org charts, technologies, corporate hierarchy, audiences
- `test` blocks on both credentials, using `GET /users/usage` as the check
- Official ZoomInfo brand icons (current icons are placeholders)

## Compatibility

Tested against n8n nodes API version 1. Requires Node.js 20 or later.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [ZoomInfo API documentation](https://docs.zoominfo.com/)

## License

[MIT](LICENSE)
