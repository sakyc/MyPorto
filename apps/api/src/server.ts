import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/client.js";
import { maintenance } from "./services/maintenance.js";

const server = createApp(config.WEB_ORIGIN).listen(
  config.PORT,
  config.HOST,
  () => {
    console.info(`RF API listening on http://${config.HOST}:${config.PORT}`);
  },
);
const cleanup = setInterval(
  () => {
    maintenance().catch(() =>
      console.error("Scheduled cleanup failed. Check database connectivity."),
    );
  },
  24 * 60 * 60_000,
);
cleanup.unref();
server.on("error", () => {
  console.error("Could not start RF API. Check the configured host and port.");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(cleanup);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
