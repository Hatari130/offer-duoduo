# OfferFlow API

Server boundary shared by the website and browser extension. It owns database
access, authentication, synchronization, opportunity imports and platform AI
requests. The HTTP runtime has not been selected yet; the package currently
keeps contracts and module ownership compile-checked without pretending that a
backend is already deployed.

Database migrations live in `packages/db`. Browser code must never import that
package or receive `DATABASE_URL`.
