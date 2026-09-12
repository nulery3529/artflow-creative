import { betterAuth } from "better-auth";
import pg from "pg";

const { Pool } = pg;

function cleanEnvValue(value) {
  const text = String(value || "").trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

let googleClientId = cleanEnvValue(process.env.GOOGLE_CLIENT_ID);
let googleClientSecret = cleanEnvValue(process.env.GOOGLE_CLIENT_SECRET);

// If the OAuth client ID and client secret were entered into Vercel in the
// opposite fields, correct the order before configuring Better Auth. Detect
// the client ID by its Google-issued suffix rather than assuming a particular
// client-secret prefix, because older/newer Google secrets can use different formats.
const looksLikeGoogleClientId = (value = "") => /\.apps\.googleusercontent\.com$/i.test(String(value || "").trim());
if (!looksLikeGoogleClientId(googleClientId) && looksLikeGoogleClientId(googleClientSecret)) {
  [googleClientId, googleClientSecret] = [googleClientSecret, googleClientId];
}

const vercelProductionURL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "";
const vercelDeploymentURL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "";
const canonicalProductionURL = "https://artflowcreative.com";
// Never let a stale BETTER_AUTH_URL override the canonical host in production.
// Google OAuth redirect URIs must match exactly, and Better Auth derives
// /api/auth/callback/google from this base URL.
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

export const auth = betterAuth({
  appName: "Art Flow Creative",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    // Better Auth may need more than one connection during sign-in/session
    // handling. Keep this small to protect Neon, but not single-connection.
    max: 3,
  }),
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
  socialProviders: googleClientId && googleClientSecret ? {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      accessType: "offline",
      // Every explicit Google connection in ArtFlow must be capable of both
      // tracker access and Gmail sales syncing. Keeping the complete required
      // scope set at the provider level protects future UI entry points from
      // accidentally creating a partially-authorized Google account.
      scope: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      // Google may omit a refresh token on repeat authorizations unless consent
      // is requested again. ArtFlow depends on a refresh token for background
      // syncing when the user's browser is closed.
      prompt: "select_account consent",
    },
  } : {},
  databaseHooks: {
    account: {
      update: {
        before: async (account) => {
          // Google only issues a refresh_token on first consent (or forced
          // re-consent). On later incremental grants it is omitted, and
          // better-auth would otherwise write null over the stored token,
          // permanently breaking offline sync for Gmail/Sheets/Drive.
          if (account?.providerId === "google" && !account?.refreshToken) {
            return { data: { refreshToken: undefined } };
          }
          return false;
        },
      },
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