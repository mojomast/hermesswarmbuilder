import { runCommandBuilderSelfCheck } from "./app.js";

const result = runCommandBuilderSelfCheck();
if (!result.ok || result.count !== 30) throw new Error(`Expected 30 command builders, checked ${result.count}`);
console.log(`Jacquard command builders: ${result.count} passed`);
