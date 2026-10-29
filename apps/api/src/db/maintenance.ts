import { maintenance } from "../services/maintenance.js";
import { pool } from "./client.js";
maintenance()
  .then(() =>
    console.info(
      "Expired sessions, challenges, visitor hashes, and messages cleaned up.",
    ),
  )
  .catch(() => {
    console.error("Maintenance failed. Check the database.");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
