const app = require("./app");
const config = require("./config");
const logger = require("./utils/logger");

const server = app.listen(config.port, () => {
  logger.info(`Auth server running on port ${config.port}`, { env: config.nodeEnv });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
