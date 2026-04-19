import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.string().default("3001"),
  PRIVATE_KEY: z.string().startsWith("0x"),
  CONTRACT_ADDRESS: z.string().startsWith("0x"),
  RPC_URL: z.string().url(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_ADDRESSES: z.string().default(""),
  JWT_SECRET: z.string().min(32),
  PLATFORM_URL: z.string().url().default("http://localhost:3001"),
});

export const env = envSchema.parse(process.env);

export const adminAddresses = env.ADMIN_ADDRESSES.split(",")
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);
