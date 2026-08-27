# Chrome Web Store assets

These files are the production listing assets for the JobKoI extension.

- Run `pnpm --filter @offerflow/extension assets:store` after changing an SVG source or the captured UI screenshots.
- The two raw screenshots contain seeded fictional application records and no real user data.
- Upload only the generated PNG files at the root of this directory to the Store dashboard.
- Do not upload the current HTTP transition ZIP. Build a fresh submission package after the public API uses HTTPS.
