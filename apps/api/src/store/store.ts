import type { MemoryStore } from "./memory-store.ts";

export type Awaitable<T> = T | Promise<T>;

export type OfferFlowStore = {
  [K in keyof MemoryStore]:
    MemoryStore[K] extends (...args: infer Args) => infer Result
      ? (...args: Args) => Awaitable<Result>
      : MemoryStore[K];
};
