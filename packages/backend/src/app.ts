import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { routes } from "./routes/index.js";
import v1Routes from "./routes/v1.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/api", routes);
app.use("/v1", v1Routes);
app.use(errorHandler);

export default app;
