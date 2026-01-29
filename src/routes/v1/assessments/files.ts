import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../types/bindings";
import { AssessmentRepository } from "../../../domain/assessments/repository";

const files = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /v1/assessments/files/:fileId — Download assessment file
files.get("/files/:fileId", async (c) => {
  const fileId = c.req.param("fileId");

  const repo = new AssessmentRepository(c.env.DB);
  const file = await repo.getFileById(fileId);

  if (!file) {
    return c.json({ error: "File not found", code: "FILE_NOT_FOUND" }, 404);
  }

  const r2Object = await c.env.CV_BUCKET.get(file.r2Key);

  if (!r2Object) {
    return c.json({ error: "File not found in storage", code: "FILE_NOT_FOUND" }, 404);
  }

  return new Response(r2Object.body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.fileSize),
    },
  });
});

export default files;
