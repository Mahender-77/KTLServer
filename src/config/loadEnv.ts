/**
 * Load first so `process.env` is populated before other modules read configuration.
 */
import dotenv from "dotenv";
import path from "path";

const root = process.cwd();
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local"), override: true });

const nodeEnv = process.env.NODE_ENV ?? "development";
if (nodeEnv !== "production") {
  dotenv.config({ path: path.join(root, `.env.${nodeEnv}`), override: true });
  dotenv.config({ path: path.join(root, `.env.${nodeEnv}.local`), override: true });
}
