import { Hono } from "hono";

import internal from "./routes/internal/route";
import v1 from "./routes/v1";

const app = new Hono();

app.route("/v1", v1);
app.route("/internal", internal);

export default app;
