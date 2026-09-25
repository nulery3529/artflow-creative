import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Art Flow login uses Apple + email paths without Google sign-in", async () => {
  const reactLogin = await source("src/pages/IndependentLogin.jsx");
  const serverLogin = await source("api/login-page.mjs");

  assert.doesNotMatch(reactLogin, /Continue with Google/);
  assert.doesNotMatch(serverLogin, /Continue with Google/);
  assert.doesNotMatch(serverLogin, /\/api\/auth\/google-login/);
  assert.match(reactLogin, /Continue with Apple/);
  assert.match(serverLogin, /Continue with Apple/);
  assert.match(reactLogin, /appleid\.cdn-apple\.com\/appleid\/button\/logo/);
  assert.match(serverLogin, /appleid\.cdn-apple\.com\/appleid\/button\/logo/);
});

test("native iOS uses Apple identity-token sign-in through Better Auth", async () => {
  const swift = await source("ios/ArtFlowWebViewController.swift");
  const auth = await source("api/auth/_auth.mjs");

  assert.match(swift, /ASAuthorizationAppleIDProvider/);
  assert.match(swift, /ASAuthorizationAppleIDCredential/);
  assert.match(swift, /\/api\/auth\/sign-in\/social/);
  assert.match(swift, /provider: 'apple'/);
  assert.match(swift, /idToken: \{ token:/);
  assert.match(auth, /appBundleIdentifier: appleBundleId/);
  assert.match(auth, /trustedProviders: \["email-password", "google", "apple"\]/);
});

test("iOS target declares the Sign in with Apple entitlement", async () => {
  const entitlements = await source("ios/ArtFlowCreative/ArtFlowCreative.entitlements");
  const project = await source("ios/ArtFlowCreative.xcodeproj/project.pbxproj");

  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(entitlements, /<string>Default<\/string>/);
  assert.match(
    project,
    /CODE_SIGN_ENTITLEMENTS = ArtFlowCreative\/ArtFlowCreative\.entitlements;/
  );
});
