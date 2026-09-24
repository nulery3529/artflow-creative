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
