import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../types/bindings";
import library from "./library";
import files from "./files";

const assessments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

assessments.route("/", library);
assessments.route("/", files);

export default assessments;
