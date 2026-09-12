export const ARTFLOW_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.readonly",
];

// ArtFlow uses one Google authorization for both the private tracker and the
// Gmail sales inbox. Keeping the complete scope set here prevents a future UI
// entry point from creating a partially-authorized Google account.
export function artflowGoogleLinkOptions({ callbackURL, loginHint = "" } = {}) {
  const canonicalCallbackURL = String(callbackURL || "").replace(
    /^https:\/\/www\.artflowcreative\.com/i,
    "https://artflowcreative.com"
  );

  return {
    provider: "google",
    callbackURL: canonicalCallbackURL || callbackURL,
    scopes: ARTFLOW_GOOGLE_SCOPES,
    loginHint: loginHint || undefined,
    additionalParams: {
      access_type: "offline",
      include_granted_scopes: "true",
      // This flow only runs when a user explicitly connects/reconnects Google.
      // Re-consent guarantees Google can return a refresh token for server-side
      // syncing even when the Google account authorized ArtFlow in the past.
      prompt: "select_account consent",
    },
  };
}
