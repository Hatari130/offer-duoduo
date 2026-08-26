import { isOpportunitySyncRequest } from "@offerflow/contracts";
import { loadApiConfig, validateProductionConfig } from "../src/config.ts";
import { PostgresStore } from "../src/store/postgres-store.ts";

const config = loadApiConfig();
validateProductionConfig(config);
if (!config.databaseUrl) throw new Error("缺少 DATABASE_URL");
const sourceUrl = process.env.OPPORTUNITY_SOURCE_URL?.trim();
if (!sourceUrl) throw new Error("缺少 OPPORTUNITY_SOURCE_URL");

const response = await fetch(sourceUrl, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`机会数据源读取失败：HTTP ${response.status}`);
const body = await response.json();
if (!isOpportunitySyncRequest(body)) throw new Error("机会数据源不符合 OpportunitySyncRequest 契约");

const store = new PostgresStore({ connectionString: config.databaseUrl });
try {
  await store.initialize();
  const feed = await store.replaceOpportunityFeed({
    opportunities: body.opportunities,
    fetchedAt: body.fetchedAt ?? new Date().toISOString(),
    sourceUpdatedAt: body.sourceUpdatedAt,
    sourceUrl: body.sourceUrl ?? sourceUrl
  });
  console.log(`imported ${feed.opportunities.length} opportunities from ${sourceUrl}`);
} finally {
  await store.close();
}
