import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { forecastRouter } from "./routes/forecast.js";
import { masterDataRouter } from "./routes/masterData.js";
import { setupRouter } from "./routes/setup.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/", (_req, res) => {
  res.json({ name: "g-demand-api", version: "0.1.0" });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/setup", setupRouter);
app.use("/master-data", masterDataRouter);
app.use("/forecast", forecastRouter);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.PORT}`);
});
