import { betterAuth } from "better-auth";
import pg from "pg";

const { Pool } = pg;

const vercelProductionURL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "";
const vercelDeploymentURL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "";
// Canonical production domain used by Better Auth on Vercel.
const canonicalProductionURL = "https://artflowcreative.com";
const baseURL = process.env.BETTER_AUTH_URL || (
  process.env.VERCEL_ENV === "production"
    ? canonicalProductionURL
    : vercelDeploymentURL || vercelProductionURL || canonicalProductionURL
);

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
  },
  session: {
    // Keep Art Flow sessions stable on mobile instead of forcing frequent re-authentication.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    // A user may enter through either the apex or www hostname. Share the same
    // secure Better Auth cookie across both so API calls do not suddenly become 401.
    crossSubDomainCookies: {
      enabled: true,
      domain: "artflowcreative.com",
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["email-password"],
      allowDifferentEmails: false,
    },
  },
  socialProviders: {},
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
