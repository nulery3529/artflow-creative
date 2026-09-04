import { toNodeHandler } from "better-auth/node";
import { auth } from "./_auth.mjs";

const handler = toNodeHandler(auth);

export default async function authHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error("Better Auth request failed", {
      name: error?.name || "Error",
      message: error?.message || String(error),
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasBetterAuthSecret: Boolean(process.env.BETTER_AUTH_SECRET),
      hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
      vercelEnv: process.env.VERCEL_ENV || "",
    });

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Authentication service unavailable",
        code: "AUTH_HANDLER_FAILED",
      });
    }
    return res.end();
  }
}
