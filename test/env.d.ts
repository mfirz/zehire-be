declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    CV_BUCKET: R2Bucket;
    JOB_QUEUE: Queue;
    AI: Ai;
    TEST_MIGRATIONS: D1Migration[];
  }
}
