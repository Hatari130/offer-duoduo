import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createOfferFlowApp, type OfferFlowAppOptions } from "./app.ts";
import { validateProductionConfig } from "./config.ts";

export function createOfferFlowServer(options: OfferFlowAppOptions = {}) {
  const app = createOfferFlowApp(options);
  const ready = Promise.resolve(app.store.initialize?.());
  const server = createServer((request, response) => {
    void ready.then(() => app.handler(request, response)).catch((error) => {
      console.error("OfferFlow API initialization failed", error);
      if (!response.headersSent) {
        response.statusCode = 503;
        response.setHeader("content-type", "application/json; charset=utf-8");
      }
      response.end(JSON.stringify({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "数据库尚未就绪" } }));
    });
  });
  server.on("close", () => {
    void Promise.resolve(app.store.close?.()).catch((error) => console.error("OfferFlow store close failed", error));
  });
  return { ...app, server, ready };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const application = createOfferFlowServer();
  validateProductionConfig(application.config);
  await application.ready;
  application.server.listen(application.config.port, application.config.host, () => {
    console.log(`OfferFlow API listening on ${application.config.requireHttps ? "https" : "http"}://${application.config.host}:${application.config.port}`);
  });
}
