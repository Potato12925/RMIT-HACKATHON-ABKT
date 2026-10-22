import type { snapshot } from "./service";
type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
export type Snapshot = Json<Awaited<ReturnType<typeof snapshot>>>;
export type TransactionView = Snapshot["transactions"][number];
