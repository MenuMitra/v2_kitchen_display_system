const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const authRoutes = require("./routes/auth");
const { globalLimiter } = require("./middleware/rateLimiter");
const { errorHandler } = require("./middleware/auth");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(globalLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "kds-auth-server" });
});

app.use("/api/auth", authRoutes);

app.use(errorHandler);

module.exports = app;
