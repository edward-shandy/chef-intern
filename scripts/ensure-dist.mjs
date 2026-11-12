// Wrangler refuses to start when the assets directory is missing.
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
