# iOS wrapper notes

The web app's paywall activates only when the iOS wrapper injects the native platform marker and registers the `artflowIAP` WKWebView handler.

Add your real App Store Connect subscription product IDs to the app target's Info.plist as an Array named:

`ARTFLOW_IAP_PRODUCT_IDS`

Do not hard-code localized prices. StoreKit returns the localized display name and price to the paywall.

Before App Store submission:
- Configure the subscriptions in App Store Connect.
- Put monthly/yearly versions in the same subscription group if both are offered.
- Test purchases, renewal, cancellation, billing retry, and restore in StoreKit Testing and Sandbox.
- Add App Store Server Notifications V2 if web access should also unlock from an iOS purchase.
- Submit the subscription products with the app build for review.


## Art Flow Creative launch subscription configuration

Create one auto-renewable subscription group in App Store Connect and add these two products exactly:

- Monthly: `com.artflowcreative.app.monthly` — US price target: **$9.99/month**
- Yearly: `com.artflowcreative.app.yearly` — US price target: **$79.99/year**

Configure a **7-day introductory free trial** for each launch subscription in App Store Connect. The iOS app intentionally reads localized price/display text from StoreKit instead of hard-coding currency in the web UI.

The product IDs above are already configured in `ArtFlowCreative/Info.plist`.

Before submission:
1. Create the subscription group and both product IDs in App Store Connect.
2. Add localization, subscription description, review screenshot, and required tax/banking agreements.
3. Configure the 7-day free trial.
4. Test monthly purchase, yearly purchase, cancellation, pending purchase, expiration, and Restore Purchases with StoreKit/Sandbox.
5. Submit both subscription products with the first app version.


## Sign in with Apple

The app now supports Better Auth's Apple provider conditionally. The Apple button stays hidden until all required credentials are present, so current Google/email login is unchanged.

Apple Developer setup:
- Primary App ID / iOS bundle ID: `com.artflowcreative.app`
- Create a Sign in with Apple Service ID (recommended identifier: `com.artflowcreative.app.signin`)
- Domain: `artflowcreative.com`
- Return URL: `https://artflowcreative.com/api/auth/callback/apple`
- Create a Sign in with Apple key and download its `.p8` private key.

Production environment variables required:
- `APPLE_CLIENT_ID` — the Service ID used for web sign-in
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY` — full contents of the downloaded .p8 key
- `APPLE_APP_BUNDLE_IDENTIFIER=com.artflowcreative.app`

When all four credentials are present, Art Flow automatically exposes **Continue with Apple** on both login experiences. The backend generates Apple's client-secret JWT dynamically and accepts the native bundle identifier as the app audience.
