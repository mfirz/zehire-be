import type { Context } from "hono";

export function get(c: Context) {
  return c.text("hello", 200);
}
