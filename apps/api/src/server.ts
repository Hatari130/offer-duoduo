import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createOfferFlowApp, type OfferFlowAppOptions } from "./app.ts";

export function createOfferFlowServer(options: OfferFlowAppOptions = {}) {
  const app = createOfferFlowApp(options);
  const server = createServer((request, response) => {
    void app.handler(request, response);
  });
  return { ...app, server };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server, config } = createOfferFlowServer();
  server.listen(config.port, config.host, () => {
    console.log(`JobKoI API listening on http://${config.host}:${config.port}`);
  });
}
