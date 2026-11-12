# Changelog

## Unreleased

### Copilot API

Adds the first Copilot (`/gtm/copilot/v1`) endpoints. Same host and credential, but a
different path prefix, so these operations set `baseURL` on their own request and the
Data API operations are unchanged. All are GETs with individual fields rather than an
Attributes JSON object.

- **Contact**: Get Lookalikes and Get Recommendations.
- **Company**: Get Lookalikes (by Company ID or Name, with same revenue range / country
  / industry / employee range filters).
- These need a scope the DevPortal app may not hold yet (`api:recommendations:read`)
  and an account role to match; see the README's *Copilot operations*. Apps connected
  before the scope was enabled must be reconnected.

### Configurable base URL

The credential gains a hidden **Base URL** (default `https://api.zoominfo.com/gtm`),
and the Data API, Copilot API and dropdown lookups now derive their host from it
instead of a hardcoded one. This lets n8n route the node through n8n Connect. The
OAuth authorization and token URLs still point at ZoomInfo. Requests are unchanged
for existing credentials.

- Node version 1.1 marks installs that support it; behaviour is identical to 1.
- The credential's **Test** button now calls `GET /lookup/search` (with the
  required `filter[entity]` and `filter[fieldType]`) instead of `GET /users/usage`.
  Both are credit-free, but the lookup returns static reference data rather than
  the account's credit usage.

## 1.1.0

Completes the Data API surface. Same base path and credential as everything else in
this node — no new plumbing.

- New **Lookup** resource: Get Data (`GET /lookup/{fieldName}`, e.g. `industries`,
  `tech-vendors`, `intent-topics`), Get Search Fields (`GET /lookup/search`), and Get
  Enrich Fields (`GET /lookup/enrich`).
- **Company**: Enrich Org Chart, Enrich Corporate Hierarchy, Enrich Technologies, and
  Enrich Hashtags.
- **Signal**: Enrich Intent, Enrich News, and Enrich Scoops, alongside the existing
  Search operations.
- `Company → Enrich Org Chart`'s Department and `Signal → Search/Enrich Intent`'s
  Topics are now dedicated dropdowns populated from ZoomInfo's own lookup data,
  instead of free-text values inside the Attributes JSON. Both fields are a closed,
  account-specific vocabulary, so a hand-typed value could 400; picking from the
  list rules that out. Values already set inside Attributes keep working if the
  new field is left empty.

## 1.0.1

Aligns the credential with n8n's [Managed OAuth
guidelines](https://sites.n8n.io/managed-oauth-guidelines), which opens Managed
OAuth to nodes built by the owner of the underlying service. No behaviour or
field values change; the credential already matched the required shape.

- Documented n8n's **production** callback URL,
  `https://oauth.n8n.cloud/oauth2/callback`. Only the localhost callback was
  listed before, which is the one a Cloud connect attempt does *not* use, so a
  DevPortal app configured from the old README would reject it.
- `ZoomInfoPkceOAuth2Api.documentationUrl` now opens this README's Credentials
  section instead of ZoomInfo's PKCE page. That is the "Docs" link in the
  credential dialog, and the README is where the callback URLs, the
  rotating-refresh-token caveat and the scope rationale actually live.
- README section on Managed OAuth: what Cloud users see, that bring-your-own-app
  remains available, and that a shared app changes who holds the client
  credentials without widening whose data a workflow can reach — the PKCE user
  login still binds each execution to the signed-in user's entitlements.
- Recorded why `scope` is empty rather than a fixed list, in both the credential
  and the README. Omitting it requests exactly the app's DevPortal scope
  selection; naming a scope the app lacks fails the whole token exchange.

## 1.0.0

Initial release, published as `@zoominfo/n8n-nodes-zoominfo`. The scope is
ZoomInfo's existing npm organisation, the same one that owns
`@zoominfo/gtm-ai-cli`, so ownership of the package follows org membership
rather than one maintainer's account.

- ZoomInfo node covering the GTM API: Contact (search, enrich), Company (search,
  enrich), Signal (intent, scoops, news), and Usage (get).
- `ZoomInfoPkceOAuth2Api` credential using authorization code + PKCE, the node's
  only credential: users are redirected to the ZoomInfo login and sign in with
  their own username and password, so the workflow acts as that ZoomInfo user.
  It exposes a `test` request against `GET /users/usage`, so the **Test** button
  in the credential dialog works. The endpoint consumes no credits.
- Test suite (`npm test`) driving the compiled node through n8n's declarative
  router against a local mock API, plus live API verification (`npm run test:live`)
  behind an opt-in credential check.
- Example workflows in the README, importable by pasting onto an n8n canvas, plus a
  test that keeps them in sync with the node's parameters and operations.
- Tests pinning the meaning of the two totals ZoomInfo returns: `meta.page.total` is
  a *page* count and drives "Return All", while the adjacent `meta.totalResults` is
  the *record* count. Swapping them would make "Return All" over-fetch.

Fixed before release, all found by the routing tests:

- **"Return All" requested `page[number]=NaN` on every page.** The pagination block
  used `{{ $pageCount + 1 }}`, but `$pageCount` is only available to function-style
  pagination; in a declarative `generic` block it resolves to `undefined`. The page
  number is now read back from the response's own `meta.page.number`.
- **"Return All" dropped `sort` and `page[size]`.** n8n shallow-merges the
  pagination request over the base request, so the pagination `qs` replaced the base
  query wholesale. Both are now carried across explicitly.
- **`Limit` collided with `Return All` over `page[size]`.** `Return All` set it via a
  static `send.value`, which applies whenever the property is *visible* rather than
  when it is true, so both wrote the same query parameter and `Limit` won only by
  virtue of declaration order. `Return All` no longer writes `page[size]` directly.
- **`Attributes` accepted a literal `null`**, sending `"attributes": null` to the API,
  because `typeof null === 'object'` passed the object check. A whitespace-only value
  is now also treated as empty, matching how an empty string was already handled.
- **CI cancelled unrelated runs.** The `concurrency.group` was the literal `ci-$`
  rather than an interpolated ref, putting every branch in one group.
- **The publish workflow would have failed on its first run.** `NPM_TOKEN` was set to
  the literal `$` instead of `${{ secrets.NPM_TOKEN }}`. Being non-empty, it satisfied
  the guard that writes an npm auth token, so `.npmrc` got `_authToken=$` and the OIDC
  trusted-publishing path was never reached.

Release hygiene, fixed before release:

- **The published tarball carried 207 kB of TypeScript build cache.** `incremental: true`
  with `outDir: ./dist/` put `tsconfig.tsbuildinfo` inside the one directory `files`
  publishes, making the build cache 80% of the unpacked package. `tsBuildInfoFile` now
  points outside `dist`.
- **`@n8n/node-cli` was pinned to `*`.** The publish workflow depends on a hard
  `>= 0.23.0` floor for the provenance flag, which a wildcard cannot enforce.
- **The node declared a dark icon variant that did not exist.** `icons/zoominfo.dark.svg`
  was byte-identical to the light file. The mark is a self-contained red tile that reads
  on either canvas, so the node and credential now declare a single icon.
- **Dead documentation links.** n8n moved its node-authoring docs from
  `/integrations/creating-nodes/*` to `/connect/create-nodes/*`, and the community-node
  installation and fair-code license pages both moved. README and AGENTS.md now point at
  pages that exist.
