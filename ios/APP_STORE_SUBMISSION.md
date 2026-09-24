# Art Flow Creative — App Store Submission Pack

Prepared for the first iOS submission.

## App information

**App name:** Art Flow Creative

**Bundle ID:** `com.artflowcreative.app`

**Primary category:** Business

**Secondary category:** Productivity

**Subtitle (30 characters max):**

Business tools for artists

**Promotional text:**

Run your art business in one place with order tracking, expenses, inventory, mileage, reports, and practical business tools built for working artists.

## Description

Art Flow Creative is a business management app built for artists who sell across marketplaces and need a simpler way to stay organized.

Keep your day-to-day business information together instead of switching between marketplaces, inboxes, notes, and separate trackers.

Key features include:

- Marketplace order and sales tracking
- Business expense and receipt tracking
- Inventory and product records
- Available and sold-item history
- Mileage tracking
- Reports and tax-planning tools
- Business planning and financial organization
- Backup and export tools
- Optional Gmail connection for importing supported marketplace sales and business receipt emails
- Account controls, including permanent in-app account deletion

Art Flow Creative is designed to help independent artists spend less time organizing business records and more time creating.

Some features require an auto-renewable subscription purchased through Apple. Available plans, localized prices, billing periods, and any eligible introductory offers are shown before purchase.

## Keywords

artist,business,inventory,orders,expenses,sales,mileage,reports,marketplace,studio

## URLs

**Marketing URL:** https://artflowcreative.com

**Support URL:** https://artflowcreative.com/support

**Privacy Policy URL:** https://artflowcreative.com/privacy-policy

**Terms of Service URL:** https://artflowcreative.com/terms-of-service

**Support email:** help@artflowcreative.com

## Subscription products

Use one auto-renewable subscription group.

### Monthly

- Product ID: `com.artflowcreative.app.monthly`
- US launch target: $9.99/month
- Introductory offer: 7-day free trial

### Yearly

- Product ID: `com.artflowcreative.app.yearly`
- US launch target: $79.99/year
- Introductory offer: 7-day free trial

The app reads localized names, prices, subscription periods, and introductory-offer eligibility from StoreKit. Do not hard-code the displayed App Store price in the native submission.

## App Review notes

Art Flow Creative is a business-management app for independent artists.

A reviewer can create an account directly in the app with email and password. Sign in with Google is intentionally not presented as the only third-party login option in the native iOS app. Sign in with Apple appears automatically when the Apple provider is configured.

The iOS app includes native Apple integrations in addition to the hosted business interface:
- Native Sign in with Apple via AuthenticationServices; the Apple ID token is verified by Better Auth and establishes the Art Flow session in the app WebView
- StoreKit 2 subscription purchases and entitlement checks
- Native iOS share sheet for Sales and Expense CSV exports (Files, AirDrop, Mail, Messages, and other installed share targets)
- Native pull-to-refresh for the main app view
- External marketplace/support links open with the appropriate iOS app instead of being trapped in the Art Flow WebView
- Light native haptic feedback when an export is handed to the iOS share sheet

The iOS subscription screen supports:
- monthly and yearly auto-renewable subscriptions
- eligible introductory free trials
- Restore Purchases
- current-entitlement checking
- Manage Apple Subscription

Account deletion is available in-app under:

**Account → Delete Account**

The app removes the user's Art Flow account and associated owned business data. The deletion screen also warns that deleting an Art Flow account does not cancel an Apple subscription and provides a Manage Apple Subscription action.

Gmail connection is optional. When connected, Art Flow requests read-only Gmail access to import supported marketplace sale messages and business receipt/expense emails. Gmail is not required to create an account or review the rest of the app.

The eBay marketplace-account-deletion compliance endpoint is:

`https://artflowcreative.com/api/ebay-account-deletion`

## App privacy preparation

No obvious advertising, analytics, behavioral-tracking, Facebook Pixel, Firebase Analytics, Mixpanel, Segment, PostHog, Amplitude, or Sentry SDK is present in the current repository.

Before submitting the App Privacy questionnaire, confirm every data type actually collected in production. Current functionality can include user-provided or connected information such as:

- email address and account identity
- business/order/sales records
- business expenses and receipt information
- inventory/product information and product images
- mileage and business-planning records
- optional Gmail-derived sale/expense information
- marketplace identifiers needed to connect or reconcile supported services

These data are used to provide the app's business-management features and are not intended for advertising tracking.

Do not mark a privacy answer solely from this document; verify the live production data flow when completing App Store Connect's questionnaire.

## Export compliance

The iOS app's Info.plist declares:

`ITSAppUsesNonExemptEncryption = NO`

This reflects the current native app, which relies on Apple/system-provided networking and cryptographic services rather than implementing non-exempt custom encryption.

## Final account-side checklist

The codebase is prepared, but these items must be completed in Apple-controlled accounts before submission:

- Verify Apple Developer membership and signing access.
- Create the app record for bundle ID `com.artflowcreative.app`.
- Create the monthly and yearly subscription products using the exact IDs above.
- Put both products in the same auto-renewable subscription group.
- Add subscription localization and review screenshots.
- Configure the intended US prices.
- Configure the 7-day introductory free trial.
- Complete required banking, tax, and paid-app agreements.
- Complete App Privacy answers based on the live production data flow.
- Upload required App Store screenshots.
- Archive/sign the Release build and upload it to App Store Connect/TestFlight.
- Test account creation, login, purchase, free-trial eligibility, restore, renewal/cancellation behavior, Manage Subscription, and Delete Account using Apple's sandbox/TestFlight environment.
- Reconnect the Gmail account that currently has an invalid Google refresh authorization before validating Gmail background sync.
- If Sign in with Apple is desired, create the Apple Service ID/key and add the required Apple production credentials. Never paste the private .p8 key into chat.

## Current automated quality gates

The repository includes:

- **Launch QA:** install, tests, lint, and production web build on Node 24.
- **iOS Build Check:** Release compilation for both iOS Simulator and a generic iOS device target on GitHub's `macos-26` runner.

Latest verified submission-valid native build:
- Xcode 26.6 (build 17F113)
- iOS Simulator Release build: passed
- generic iOS device Release build: passed

Both gates were passing when this submission pack was prepared.


## Suggested App Review walkthrough

Apple can review the core app without connecting a marketplace account:

1. Open Art Flow Creative and create an account with email and password.
2. On the subscription screen, review the monthly/yearly StoreKit products, introductory offer (when eligible), Terms, Privacy Policy, and Restore Purchases.
3. After subscription entitlement is active, open Orders, Expenses, Inventory, Mileage, Reports, and Business Planning from the main navigation.
4. Use Export on a report/order view to test the native iOS share sheet.
5. Pull down on the main app view to test native pull-to-refresh.
6. Open Account to review support, connected-account controls, Manage Apple Subscription, and permanent Delete Account.
7. Gmail and marketplace connections are optional integrations and are not required to create an account or inspect the core business-management experience.

Public review URLs:
- Support: https://artflowcreative.com/support
- Privacy Policy: https://artflowcreative.com/privacy-policy
- Terms of Service: https://artflowcreative.com/terms-of-service


### Native authentication behavior

In the iOS wrapper:
- Continue with Apple uses Apple's native `ASAuthorizationAppleIDProvider` flow.
- The native Apple ID token is sent to Art Flow's Better Auth social sign-in endpoint from the existing Art Flow WebView so the resulting session cookie belongs to that WebView session.
- Google login is intentionally hidden in the native iOS wrapper to avoid third-party OAuth inside an embedded WebView.
- Email/password login remains available.
- On the public website, Google login remains available and Apple can use the normal web provider flow.
