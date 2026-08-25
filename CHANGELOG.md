# Changelog

## 0.1.0

Initial release.

- ZoomInfo node covering the GTM API: Contact (search, enrich), Company (search,
  enrich), Signal (intent, scoops, news), and Usage (get).
- `ZoomInfoOAuth2Api` credential using the client-credentials grant, recommended
  for unattended workflows.
- `ZoomInfoPkceOAuth2Api` credential using authorization code + PKCE, for acting on
  behalf of a specific ZoomInfo user.
