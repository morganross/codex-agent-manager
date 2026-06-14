import { bootstrapAntigravity } from "../src/antigravity.js";

bootstrapAntigravity((type, payload) => {
  console.log(`[${type}] ${payload.message}`);
});
