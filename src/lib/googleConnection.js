export const ARTFLOW_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
];

// Google is used only for Gmail sales and expense syncing.
// Art Flow no longer requests Google Drive or Google Sheets access.
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
