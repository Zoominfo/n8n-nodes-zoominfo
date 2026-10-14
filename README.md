# @zoominfo/n8n-nodes-zoominfo

An [n8n](https://n8n.io) community node for the **ZoomInfo GTM API** — contact and
company search and enrichment, org charts, corporate hierarchy, technologies,
hashtags, intent signals, scoops, news, reference lookups, and usage reporting.

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
`GET /lookup/search`. That endpoint consumes no credits, so connections can be tested
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

Add n8n's OAuth callbacks to the **Sign-in Redirect URIs** list on your DevPortal
app. They must match exactly on both the authorize and token calls, so add both:

```
https://oauth.n8n.cloud/oauth2/callback
http://localhost:5678/rest/oauth2-credential/callback
```

The first is n8n's production callback, used by Cloud. The second is for local and
self-hosted instances — replace the host with your own instance URL when it is not
localhost.

> **One caveat worth knowing.** ZoomInfo issues **single-use, rotating** refresh tokens
> on this flow: every refresh invalidates the previous token. If two executions of the
> same workflow refresh concurrently, one kills the other's token and the credential
> must be reconnected by hand. Keep concurrency at 1 on schedules that run unattended.

### Managed OAuth on n8n Cloud

n8n offers [Managed OAuth](https://sites.n8n.io/managed-oauth-guidelines) for nodes
built by the owner of the underlying service. Under it, ZoomInfo registers one OAuth
app and n8n holds the client ID and secret, so Cloud users get a single **connect**
button and never have to create a DevPortal app of their own. Anyone who prefers
their own app keeps that option, and self-hosted instances continue to use it.

This changes who owns the client credentials, not whose data a workflow sees. The
flow is still an authorization-code + PKCE user login: each person signs in with
their own ZoomInfo username and password, and the workflow runs with that user's
entitlements. A shared app does not pool or widen access.

### Scopes

The credential deliberately sends **no** `scope` parameter. This is not the same as
requesting everything: ZoomInfo grants exactly the scopes selected for your app in
the DevPortal when `scope` is omitted, whereas naming a scope your app does not hold
fails the entire token request. The app registration is the ceiling, so sending
nothing asks for that set and nothing wider — and it holds equally for a customer's
own app and for the shared app behind Managed OAuth. Manage entitlements in the
DevPortal, not here.

## Operations

Base URLs: `https://api.zoominfo.com/gtm/data/v1` for the Data API, and
`https://api.zoominfo.com/gtm/copilot/v1` for the Copilot operations marked ✱ below.
Both use the same credential.

| Resource | Operation | Endpoint | Body `type` |
| --- | --- | --- | --- |
| Contact | Search | `POST /contacts/search` | `ContactSearch` |
| Contact | Enrich | `POST /contacts/enrich` | `ContactEnrich` |
| Contact | Get Lookalikes ✱ | `GET /contacts/lookalikes` | — |
| Contact | Get Recommendations ✱ | `GET /contacts/recommendations` | — |
| Company | Search | `POST /companies/search` | `CompanySearch` |
| Company | Enrich | `POST /companies/enrich` | `CompanyEnrich` |
| Company | Enrich Org Chart | `POST /companies/org-chart/enrich` | `OrgChartEnrich` |
| Company | Enrich Corporate Hierarchy | `POST /companies/corporate-hierarchy/enrich` | `CorporateHierarchyEnrich` |
| Company | Enrich Technologies | `POST /companies/technologies/enrich` | `TechnologyEnrich` |
| Company | Enrich Hashtags | `POST /companies/hashtags/enrich` | `HashtagEnrich` |
| Company | Get Lookalikes ✱ | `GET /companies/lookalikes` | — |
| Signal | Search Intent | `POST /intent/search` | `IntentSearch` |
| Signal | Search Scoops | `POST /scoops/search` | `ScoopSearch` |
| Signal | Search News | `POST /news/search` | `NewsSearch` |
| Signal | Enrich Intent | `POST /intent/enrich` | `IntentEnrich` |
| Signal | Enrich Scoops | `POST /scoops/enrich` | `ScoopEnrich` |
| Signal | Enrich News | `POST /news/enrich` | `NewsEnrich` |
| Lookup | Get Data | `GET /lookup/{fieldName}` | — |
| Lookup | Get Search Fields | `GET /lookup/search` | — |
| Lookup | Get Enrich Fields | `GET /lookup/enrich` | — |
| Usage | Get | `GET /users/usage` | — |

`Usage → Get` consumes no credits, which makes it a good first call for verifying that
a credential works. `Lookup` operations consume no credits either, since they return
static reference data rather than ZoomInfo records. Search and Enrich operations do
count against your rate limits and, for Enrich, your credit balance.

`Lookup → Get Data` reads reference values for a field name such as `industries`,
`job-titles`, `tech-vendors`, or `company-rankings`. Two of these fields — intent
topics and org chart departments — are also surfaced directly as dropdowns on
`Signal → Search Intent`/`Enrich Intent` and `Company → Enrich Org Chart`, so picking
from the list is usually simpler than a separate Lookup call.
`Lookup → Get Search Fields` and `Get Enrich Fields` return the input/output field
names a given entity's Search or Enrich endpoint accepts.

### Copilot operations

The ✱ operations are plain GETs: their inputs are individual fields rather than an
Attributes JSON object, and they return the response's `data`, one item per record.

- **Contact → Get Lookalikes** takes a *Reference Person ID* and an optional *Target
  Company ID* (leave it unset to search across all companies).
- **Contact → Get Recommendations** takes a *Company ID* and a *Use Case*: Prospecting,
  Deal Acceleration, or Renewal and Growth.
- **Company → Get Lookalikes** takes a *Company ID* or a *Company Name* (one of the two
  is required; the node fails early with a clear message rather than letting the API
  answer 422). The *Filters* collection restricts results to companies with the same
  revenue range, country, industry or employee range as the reference. Only filters you
  add are sent.

The two lookalike operations and Get Recommendations take a **Limit** (`page[size]`,
1–100). They have no page number to walk, so there is no Return All.

These endpoints are gated separately from the Data API, so a 403 usually means the app
or user lacks the scope or role, not that the node is misconfigured:

| Operations | Scope | Account role |
| --- | --- | --- |
| Contact/Company Lookalikes, Contact Recommendations | `api:recommendations:read` | `fea:zia` or `fea:api` |

Because the credential sends no `scope` (see [Scopes](#scopes)), enable this scope on the
DevPortal app before connecting — an app connected before they were added needs to be
reconnected to pick them up.

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
        "attributes": "{\n  \"matchPersonInput\": [\n    { \"firstName\": \"Jane\", \"lastName\": \"Doe\", \"companyName\": \"ZoomInfo\" }\n  ],\n  \"outputFields\": [\"id\", \"email\", \"jobTitle\", \"companyName\"]\n}"
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
single record from each search endpoint and each Copilot endpoint (a 403 there means
the app lacks a scope or role, which the output says), and checks that `meta.page.total` counts
pages rather than records. Secrets and the access token are redacted from all output.

Run it before a release; it is deliberately excluded from CI.

Releases are cut by semantic-release from `.github/workflows/release.yml`
(**Actions → Release → Run workflow**), which derives the version from the
Conventional Commit messages since the last release and publishes to npm with a
provenance attestation. n8n does not accept verified nodes published from a local
machine, and `prepublishOnly` blocks one.

## Roadmap

- Typed request fields for the most common attributes, replacing the JSON pass-through
- Remaining API families: Audience (Studio) API, Agents API, and the rest of the Copilot API (lookalikes and recommendations are covered)
- Surface `detail` from platform-validation errors in the headline message, which needs
  `ignoreHttpStatusErrors` plus hand-rolled error mapping (see *Error responses*)

## Compatibility

Tested against n8n nodes API version 1. Requires Node.js 20 or later.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [ZoomInfo API documentation](https://docs.zoominfo.com/)

## License

[MIT](LICENSE)
