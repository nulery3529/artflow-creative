import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import pg from "pg";
import { pooledDatabaseUrl } from "../_db.mjs";

const { Pool } = pg;

// Keep Better Auth to a single Neon connection per serverless instance. Most
// ArtFlow API routes also use one application-data connection, so allowing the
// auth layer to open three more connections can exhaust Neon's backend slots
// during bursts of login, Gmail sync, and dashboard requests.
const authPoolKey = Symbol.for("artflow.betterAuth.pool");
function getAuthPool() {
  if (!globalThis[authPoolKey]) {
    globalThis[authPoolKey] = new Pool({
      connectionString: pooledDatabaseUrl(),
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
  }
  return globalThis[authPoolKey];
}

const vercelProductionURL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "";
const vercelDeploymentURL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "";
const canonicalProductionURL = "https://artflowcreative.com";
// The custom domain is the canonical production origin so sign-in cookies and password-reset links stay on Art Flow's domain.
const baseURL = process.env.VERCEL_ENV === "production"
  ? canonicalProductionURL
  : process.env.BETTER_AUTH_URL || vercelDeploymentURL || vercelProductionURL || canonicalProductionURL;

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

async function sendEmailSignInCode({ email, otp, type = "sign-in" }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM || process.env.PASSWORD_RESET_FROM || "Art Flow Creative <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const purpose = type === "sign-in" ? "sign in" : "verify your email";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Art Flow Creative sign-in code",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2e2140;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 12px;color:#6d48a8;">Art Flow Creative</h2>
          <p>Use this code to ${purpose}:</p>
          <div style="font-size:30px;letter-spacing:8px;font-weight:700;margin:24px 0;color:#2e2140;">${otp}</div>
          <p style="font-size:13px;color:#6b6474;">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
        </div>
      `,
      text: `Your Art Flow Creative sign-in code is ${otp}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Sign-in code email failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
}

export const auth = betterAuth({
  appName: "Art Flow Creative",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: getAuthPool(),
  plugins: [
    emailOTP({
      disableSignUp: true,
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      resendStrategy: "rotate",
      async sendVerificationOTP({ email, otp, type }) {
        await sendEmailSignInCode({ email, otp, type });
      },
    }),
  ],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendPasswordResetEmail,
  },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["email-password"],
      allowDifferentEmails: false,
    },
  },
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
