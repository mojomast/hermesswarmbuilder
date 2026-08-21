import { runCommandBuilderSelfCheck } from "./app.js";

const result = runCommandBuilderSelfCheck();
if (!result.ok || result.count !== 30) throw new Error(`Expected 30 command builders, checked ${result.count}`);
if (result.operatorControls !== 17 || !result.compactDefault) throw new Error("Expected 17 mechanical controls and a compact default readout");
console.log(`Jacquard command builders: ${result.count} passed; ${result.operatorControls} compact operator controls checked`);
