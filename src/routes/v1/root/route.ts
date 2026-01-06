import { Hono } from "hono";

import { get } from "./get";

const root = new Hono();

root.get("/", get);

export default root;
