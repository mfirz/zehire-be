import { Hono } from "hono";

import { get } from "./get";

const health = new Hono();

health.get("/", get);

export default health;
