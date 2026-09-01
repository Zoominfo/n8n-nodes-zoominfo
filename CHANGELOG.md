# Changelog

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
