import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(8),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default("admin@g-demand.local"),
  BOOTSTRAP_ADMIN_NAME: z.string().default("System Admin"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).default("ChangeMe123!")
});

export const env = envSchema.parse(process.env);
