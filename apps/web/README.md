# OfferFlow Web

Reserved boundary for the companion website. There is deliberately no fake
website build yet.

When implementation starts, keep these concerns inside this application:

- public marketing and product pages
- account and authentication UI
- application/opportunity/profile dashboards
- calls through `@offerflow/api-client`

The website may import `@offerflow/domain`, `@offerflow/contracts`,
`@offerflow/api-client` and `@offerflow/ui`. It must not import anything from
`apps/extension` or `packages/db`.
