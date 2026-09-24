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
