import { betterAuth } from "better-auth";
import pg from "pg";

const { Pool } = pg;

const vercelProductionURL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "";
const vercelDeploymentURL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "";
const canonicalProductionURL = "https://artflowcreative.com";
const baseURL = process.env.BETTER_AUTH_URL || (
  process.env.VERCEL_ENV === "production"
    ? canonicalProductionURL
    : vercelDeploymentURL || vercelProductionURL || canonicalProductionURL
);

async function sendPasswordResetEmail({ user, url }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM || "Art Flow Creative <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: "Reset your Art Flow Creative password",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2e2140;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 12px;color:#6d48a8;">Reset your Art Flow Creative password</h2>
          <p>We received a request to reset the password for your Art Flow Creative account.</p>
          <p style="margin:28px 0;">
            <a href="${url}" style="display:inline-block;background:#8b5fc7;color:white;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Choose a new password</a>
          </p>
          <p style="font-size:13px;color:#6b6474;">If you did not request this, you can ignore this email. The reset link is time-limited.</p>
        </div>
      `,
      text: `Reset your Art Flow Creative password: ${url}\n\nIf you did not request this, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
}

export const auth = betterAuth({
  appName: "Art Flow Creative",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendPasswordResetEmail,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: "artflowcreative.com",
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["email-password", "google"],
      // Google is used as a linked inbox/tracker connection, not as the primary
      // Art Flow login. Allow a user to attach more than one Gmail address.
      allowDifferentEmails: true,
    },
  },
  socialProviders: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      accessType: "offline",
      prompt: "select_account consent",
    },
  } : {},
  trustedOrigins: [
    baseURL,
    vercelProductionURL,
    vercelDeploymentURL,
    "https://artflowcreative.com",
    "https://www.artflowcreative.com",
    "https://appflowcreative.com",
    "https://www.appflowcreative.com",
    "https://artflowcreativeapp.com",
    "https://www.artflowcreativeapp.com",
  ].filter(Boolean),
});

export default auth;
