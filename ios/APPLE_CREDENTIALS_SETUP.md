# Art Flow Creative — Apple Credentials Setup

This file separates the two Apple key systems used by Art Flow Creative. They are **not interchangeable**.

## 1. App Store Connect API key — used for TestFlight/App Store upload

Purpose:
- authenticate the GitHub Actions TestFlight upload workflow;
- allow Xcode/App Store Connect automation;
- upload the signed archive to App Store Connect.

Apple location:
- App Store Connect → Users and Access → Integrations → App Store Connect API.
- A Team API key is preferred for CI because Apple documents that individual keys cannot use provisioning endpoints.

Required GitHub repository secrets:
- `APPLE_TEAM_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_P8`

The `.p8` value goes into the GitHub secret as the full text contents of the downloaded key file.

Important:
- Apple makes the private API key downloadable only once.
- Never commit the private key to GitHub source files.
- The manual workflow at `.github/workflows/testflight-upload.yml` checks out the frozen `app-store-rc-1` branch before archiving.
- The workflow uses Xcode 26 on `macos-26`.
- The workflow automatically chooses a numeric build number unless one is manually supplied.

### If App Store Connect API access is not enabled

Apple may require the Account Holder to request App Store Connect API access from:
- Users and Access → Integrations → App Store Connect API → Request Access.

## 2. Sign in with Apple private key — used for user authentication

Purpose:
- generate the Apple client-secret JWT used by Better Auth;
- allow users to choose **Continue with Apple** in Art Flow.

This is a separate private key created from Apple Developer → Certificates, Identifiers & Profiles → Keys with **Sign in with Apple** enabled.

Required production environment variables:
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `APPLE_APP_BUNDLE_IDENTIFIER=com.artflowcreative.app`

Art Flow's recommended Services ID:
- `com.artflowcreative.app.signin`

Primary app/bundle ID:
- `com.artflowcreative.app`

Website domain:
- `artflowcreative.com`

Return URL:
- `https://artflowcreative.com/api/auth/callback/apple`

The Apple login button remains hidden until the required Sign in with Apple credentials exist.

## Do not mix these keys

The names are intentionally different:

### Upload key
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_P8`

### Sign-in key
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- plus `APPLE_CLIENT_ID` and `APPLE_TEAM_ID`

The App Store Connect API key cannot be used as the Sign in with Apple private key.

## Computer-day setup order

When doing the Apple setup on a computer:

1. Confirm the Apple Developer account has bundle ID `com.artflowcreative.app`.
2. Enable Sign in with Apple on that App ID.
3. Create/associate the Services ID `com.artflowcreative.app.signin`.
4. Register domain `artflowcreative.com`.
5. Register return URL `https://artflowcreative.com/api/auth/callback/apple`.
6. Create/download the Sign in with Apple private key and safely store the one-time `.p8`.
7. Add the five Sign in with Apple production environment variables.
8. Create or enable an App Store Connect Team API key.
9. Download its separate one-time `.p8`.
10. Add the four GitHub repository secrets used by the TestFlight upload workflow.
11. Create the monthly/yearly subscription products and 7-day trial.
12. Run the manual **Upload Art Flow to TestFlight** workflow.
13. Follow `TESTFLIGHT_CHECKLIST.md`.

## Current frozen release candidate

Branch:
- `app-store-rc-1`

Bundle ID:
- `com.artflowcreative.app`

Version:
- `1.0`

Subscription IDs:
- `com.artflowcreative.app.monthly`
- `com.artflowcreative.app.yearly`

Launch targets:
- $9.99/month
- $79.99/year
- 7-day introductory trial when eligible
