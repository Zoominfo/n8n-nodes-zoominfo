# @zoominfo/n8n-nodes-zoominfo

An [n8n](https://n8n.io) community node for the **ZoomInfo GTM API** — contact and
company search and enrichment, intent signals, scoops, news, and usage reporting.

[n8n](https://n8n.io) is a [fair-code licensed](https://docs.n8n.io/privacy-and-security/sustainable-use-license)
workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Development](#development)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation),
using `@zoominfo/n8n-nodes-zoominfo` as the package name.

## Credentials

You need a ZoomInfo GTM API application, created in the ZoomInfo DevPortal. The node
ships a single credential type.

It supports the **Test** button in the credential dialog, which calls
`GET /users/usage`. That endpoint consumes no credits, so connections can be tested
as often as you like.

### ZoomInfo GTM PKCE OAuth2 API (authorization code + PKCE)

Connecting the credential opens the ZoomInfo login page; the user signs in with
their own username and password and approves access. The workflow then acts as that
ZoomInfo user, with their
entitlements, rather than as the application.

Note that ZoomInfo's PKCE flow is a **confidential** client: unlike most
public-client PKCE implementations, the token exchange still requires your
`client_secret` alongside the `code_verifier`. n8n sends both, so fill in Client ID
*and* Client Secret.

Add n8n's OAuth callback to the **Sign-in Redirect URIs** list on your DevPortal app —
it must match exactly on both the authorize and token calls:

```
http://localhost:5678/rest/oauth2-credential/callback
```

Replace the host with your n8n instance URL when not running locally.

> **One caveat worth knowing.** ZoomInfo issues **single-use, rotating** refresh tokens
> on this flow: every refresh invalidates the previous token. If two executions of the
> same workflow refresh concurrently, one kills the other's token and the credential
> must be reconnected by hand. Keep concurrency at 1 on schedules that run unattended.

### Scopes

The credential deliberately sends **no** `scope` parameter. ZoomInfo grants every
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

Note that ZoomInfo returns **two** totals, and they mean different things:
`meta.page.total` is the number of *pages*, while `meta.totalResults` is the number of
matching *records*. Pagination follows the page count.

Contact and Company search also expose **Sort By** and **Sort Descending**, which
combine into the `sort` query parameter using the field names each endpoint allows.

ZoomInfo's default rate limit is 25 requests/second, so a **Return All** over a large
result set is paced by that rather than by the node.

## Example workflows

Copy any block below and paste it onto an n8n canvas to import it. Each one expects a
credential named `ZoomInfo account` — n8n will prompt you to pick yours on import.

### Verify a connection

The cheapest possible workflow: `Usage → Get` consumes no credits, so it confirms a
credential works without spending anything.

```json
{
  "name": "ZoomInfo — verify connection",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, 0],
      "id": "a1000000-0000-4000-8000-000000000001",
      "name": "When clicking Test workflow"
    },
    {
      "parameters": { "resource": "usage", "operation": "get" },
      "type": "@zoominfo/n8n-nodes-zoominfo.zoomInfo",
      "typeVersion": 1,
      "position": [220, 0],
      "id": "a1000000-0000-4000-8000-000000000002",
      "name": "Get API usage",
      "credentials": {
        "zoomInfoPkceOAuth2Api": { "id": "1", "name": "ZoomInfo account" }
      }
    }
  ],
  "connections": {
    "When clicking Test workflow": {
      "main": [[{ "node": "Get API usage", "type": "main", "index": 0 }]]
    }
  },
  "pinData": {}
}
```

### Search contacts at a company

Returns engineering contacts at ZoomInfo, best-match first, capped at 25 records. Each
record arrives as its own n8n item.

```json
{
  "name": "ZoomInfo — search contacts",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, 0],
      "id": "b2000000-0000-4000-8000-000000000001",
      "name": "When clicking Test workflow"
    },
    {
      "parameters": {
        "resource": "contact",
        "operation": "search",
        "attributes": "{\n  \"companyName\": \"ZoomInfo\",\n  \"jobTitle\": \"engineer\"\n}",
        "sortBy": "relevance",
        "sortDescending": true,
        "returnAll": false,
        "limit": 25
      },
      "type": "@zoominfo/n8n-nodes-zoominfo.zoomInfo",
      "typeVersion": 1,
      "position": [220, 0],
      "id": "b2000000-0000-4000-8000-000000000002",
      "name": "Search contacts",
      "credentials": {
        "zoomInfoPkceOAuth2Api": { "id": "1", "name": "ZoomInfo account" }
      }
    }
  ],
  "connections": {
    "When clicking Test workflow": {
      "main": [[{ "node": "Search contacts", "type": "main", "index": 0 }]]
    }
  },
  "pinData": {}
}
```

To walk every page instead of capping the result, set `returnAll` to `true` and drop
`limit`. The node then requests `page[size]=100` and follows `page[number]` until
`meta.page` says there are no pages left.

### Enrich contacts you already have

Takes a name and company and returns ZoomInfo's data for it. `matchPersonInput` and
`outputFields` are both required by the API, and it accepts at most 25 records per call.

```json
{
  "name": "ZoomInfo — enrich contacts",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, 0],
      "id": "c3000000-0000-4000-8000-000000000001",
      "name": "When clicking Test workflow"
    },
    {
      "parameters": {
        "resource": "contact",
        "operation": "enrich",
        "attributes": "{\n  \"matchPersonInput\": [\n    { \"firstName\": \"Henry\", \"lastName\": \"Schuck\", \"companyName\": \"ZoomInfo\" }\n  ],\n  \"outputFields\": [\"id\", \"email\", \"jobTitle\", \"companyName\"]\n}"
      },
      "type": "@zoominfo/n8n-nodes-zoominfo.zoomInfo",
      "typeVersion": 1,
      "position": [220, 0],
      "id": "c3000000-0000-4000-8000-000000000002",
      "name": "Enrich contacts",
      "credentials": {
        "zoomInfoPkceOAuth2Api": { "id": "1", "name": "ZoomInfo account" }
      }
    }
  ],
  "connections": {
    "When clicking Test workflow": {
      "main": [[{ "node": "Enrich contacts", "type": "main", "index": 0 }]]
    }
  },
  "pinData": {}
}
```

### Use it as an AI Agent tool

The node sets `usableAsTool`, so it can be attached to an **AI Agent** as a tool. The
agent picks the resource and operation from the node's own metadata and can fill
*Attributes* from an expression, which lets it decide what to search for:

```
{{ JSON.stringify({ companyName: $fromAI('companyName', 'the company to search') }) }}
```

Give the agent a system prompt that mentions which operations are available — `Search
Intent` for buying signals, `Search Scoops` for org changes — so it picks sensibly.

## Error responses

ZoomInfo returns two different error shapes depending on which layer rejects the
request, and workflow error handling should expect both:

- **Gateway** (`ZI*` codes; 401/403/429): `{"error": {code, message, status, requestId, retryable}}`
- **Platform validation** (`PFAPI*` codes; 400): JSON:API style `{"title", "detail", "errors": [...]}`

A `404` with code `ZI9998` and `"No static resource ..."` means the **HTTP verb** is
wrong, not the path — the gateway does not return `405`.

One asymmetry to know about when writing error-handling branches: n8n lifts gateway
messages (`error.message`) into the error it shows, so a `429` or `403` reads clearly.
It does **not** lift the platform-validation fields, so a `400` from a malformed
*Attributes* payload shows the generic `Bad request - please check your parameters`.
The specifics are not lost — `title`, `detail` and `errors[]` are all attached to the
error and rendered in the node's error detail panel in the n8n UI. Open that panel
rather than relying on the headline message when debugging an attributes payload.

Rate limits are evaluated against per-second, per-hour and per-day windows at once.
Every response carries `X-RateLimit-*` headers, and `429` responses include
`Retry-After`.

The node does not retry on its own. For anything running unattended, open the node's
**Settings** tab and switch on **Retry On Fail** — three tries with a short wait is
enough to ride out a per-second limit. Note that n8n's retry uses a fixed delay and
does not read `Retry-After`, so if you are hitting the per-hour or per-day window
instead, retrying will not help: reduce the request volume, or spread the workflow
out on a schedule. A **Return All** over a large result set is the usual way to
discover the per-second limit, since it pages as fast as the API answers.

## Development

```bash
npm install
npm run dev       # runs n8n locally with this node linked
npm run lint
npm test          # builds, then drives the real n8n router against a mock API
npm run smoke     # builds, then checks routing, credentials and the JSON:API envelope
npm run build
```

`npm test` exercises the compiled node through n8n's declarative router
(`n8n-core`'s `RoutingNode`) against a local HTTP server, so it covers what the
description-level `smoke` checks cannot: the query string that actually goes over the
wire, the "Return All" pagination loop, response unwrapping, and how each ZoomInfo
error shape surfaces. No credentials or network access needed — it runs in CI.

### Live checks

`npm test` cannot confirm that the endpoints exist or that `meta.page` means what the
pagination expression assumes. That needs the real API:

```bash
ZOOMINFO_CLIENT_ID=... ZOOMINFO_CLIENT_SECRET=... npm run test:live
```

The same two keys can go in a `.env` file at the repo root instead (gitignored). The
script skips cleanly when they are absent, so it is safe to run unconditionally. It
performs a real token exchange, calls `GET /users/usage` (no credits), requests a
single record from each search endpoint, and checks that `meta.page.total` counts
pages rather than records. Secrets and the access token are redacted from all output.

Run it before a release; it is deliberately excluded from CI.

Releases publish from CI via `.github/workflows/publish.yml` with npm provenance;
n8n does not accept verified nodes published from a local machine.

## Roadmap

- Typed request fields for the most common attributes, replacing the JSON pass-through
- Remaining endpoints: lookup, org charts, technologies, corporate hierarchy, audiences
- Surface `detail` from platform-validation errors in the headline message, which needs
  `ignoreHttpStatusErrors` plus hand-rolled error mapping (see *Error responses*)

## Compatibility

Tested against n8n nodes API version 1. Requires Node.js 20 or later.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [ZoomInfo API documentation](https://docs.zoominfo.com/)

## License

[MIT](LICENSE)
