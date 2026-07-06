import { getDuckDbPath, initializeDuckDb } from "../data/duckdbRepository.js";

await initializeDuckDb();
console.log(`Initialized DuckDB schema at ${getDuckDbPath()}`);
