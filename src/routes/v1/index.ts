import { Hono } from "hono";

import root from "./root/route";

const v1 = new Hono();

v1.route("/", root);

export default v1;
