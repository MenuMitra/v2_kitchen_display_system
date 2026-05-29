const { Pool } = require("pg");
const config = require("../config");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  logger.error("Unexpected database pool error", { error: err.message });
});

module.exports = pool;
