export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://ims:ims@localhost:5432/ims?schema=public",
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017/ims",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 8)
};
