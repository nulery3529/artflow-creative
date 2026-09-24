# Art Flow Creative — App Privacy Worksheet

Prepared from the current iOS/web codebase for the first App Store submission.

This is an implementation worksheet, not a substitute for reviewing the live App Store Connect questionnaire. Apple requires answers to cover data collected by the app and integrated third parties, including data used only for app functionality.

## High-confidence disclosures

These data types are visibly stored or processed by the current production code and should be reviewed for disclosure.

### Contact Info

**Name**
- Art Flow account name / business owner name.
- Storefront customer name may also be stored.

**Email Address**
- Art Flow login email.
- Linked sales/expense email addresses.
- Gmail/Yahoo connected mailbox address.
- Storefront customer email.

**Phone Number**
- Storefront customer records contain an optional phone field.
- If the public storefront remains reachable from the iOS app, treat this as collected.

**Physical Address**
- Storefront shipping addresses include recipient, street, city, region, postal code, and country.
- If the public storefront remains reachable from the iOS app, treat this as collected.

### Financial Info

**Other Financial Info — likely**
- Business sales totals.
- Expenses and deductible amounts.
- Cost/profit records.
- Mileage deduction records.
- Tax-planning/business-planning records.

**Payment Info — likely NO for card/bank details**
- The current store code records payment provider/status/reference/amount.
- No card number or bank account field is present in the Art Flow database schema reviewed here.
- Confirm Stripe/payment-provider behavior before publishing.

### Purchases

**Purchase History — likely**
- Marketplace orders/sales are stored.
- Storefront order records are stored.
- Order IDs, item names, quantities, amounts, dates, platforms, and buyer/customer fields may be retained.

### Identifiers

**User ID**
- Better Auth user/account IDs.
- Art Flow legacy/profile IDs.
- Workspace/business IDs.

**Device ID — likely NO**
- No advertising/device identifier SDK or explicit device-ID collection found.

### User Content

**Photos or Videos**
- Product/inventory images can be uploaded and stored.

**Emails or Text Messages — likely**
- Optional Gmail read-only and Yahoo IMAP connections process email content to identify supported sales and business receipts.
- Parsed email-derived fields and source message IDs are stored.
- Confirm whether Apple expects this under “Emails or Text Messages” for the final questionnaire.

**Other User Content**
- Inventory/product titles and descriptions.
- Notes.
- Business plans.
- Calendar/schedule entries.
- Mileage destination and purpose.
- Expense descriptions.
- Uploaded product/business records.

### Other Data

**Connected-service credentials/tokens — verify classification**
- Google refresh authorization may be stored through Better Auth.
- eBay OAuth access/refresh tokens are stored encrypted.
- Yahoo app passwords are stored encrypted.
- These are necessary to provide connected-account functionality but do not map neatly to a named App Privacy category. Review the final App Store Connect options and privacy policy wording before publishing.

## High-confidence “No” findings from current repository

No implementation was found for:
- Precise location / GPS collection.
- Coarse device location collection.
- Address-book / Contacts access.
- HealthKit or health data.
- Fitness data.
- App Tracking Transparency / advertising identifier access.
- Advertising data collection.
- Firebase Analytics.
- Mixpanel.
- PostHog.
- Segment.
- Amplitude.
- Sentry.
- Facebook Pixel.
- Google Analytics / gtag.

The app should therefore **not** claim location, contacts, health/fitness, or advertising/tracking collection unless production infrastructure or a third-party service outside this repository adds it.

## Tracking

**Likely answer: Not used for tracking.**

Current code does not include advertising/tracking SDKs or ATT/AdSupport access. Connected Gmail/Yahoo/eBay data is used for Art Flow functionality, not cross-company advertising.

Verify that no hosting/payment/email provider is being used to create advertising profiles or share data with data brokers before publishing.

## Data linked to the user

Most collected business/account data should be treated as **linked to the user**, because it is stored under the authenticated Art Flow account/business workspace.

Likely linked:
- Name.
- Email.
- Business financial records.
- Orders/purchase records.
- Inventory/photos.
- Mileage.
- Notes/business plan.
- Connected-account information.

Storefront buyer records should be reviewed separately if the public storefront is part of the submitted iOS experience.

## Likely purpose selections

For the data above, the primary purpose is:

**App Functionality**
- Account creation/authentication.
- Order tracking.
- Expense tracking.
- Inventory.
- Reports/tax planning.
- Mileage.
- Storefront/order management.
- Gmail/Yahoo/eBay integrations.
- Backup/export.

Possible additional purpose:
- **Developer Communications** for account/password-reset/support email, if App Store Connect asks for that use separately.

Do not select advertising, third-party advertising, or tracking purposes based on the current code.

## Payment / Stripe note

Apple’s privacy guidance says payment information does not need to be disclosed as collected when payment information is entered outside the app through a payment service and the developer never has access to that payment information.

The current Art Flow database stores payment status/reference/amount but no card number/bank account field was found. Confirm the live Stripe flow before answering Payment Info.

## Live privacy URLs

- Privacy Policy: https://artflowcreative.com/privacy-policy
- Terms of Service: https://artflowcreative.com/terms-of-service
- Support: https://artflowcreative.com/support

## Before pressing Publish in App Store Connect

Verify:
1. Whether the public storefront is included in the iOS navigation/review experience. If yes, include storefront contact/address/order data.
2. Stripe never exposes or stores card/bank details in Art Flow.
3. Vercel/Neon/Resend/Google/Yahoo/eBay provider practices that must be included as integrated partners.
4. No new analytics/crash/advertising SDK was added after this worksheet.
5. Gmail/Yahoo email-content classification in the current App Store Connect UI.
6. Every selected data type is marked accurately for:
   - purpose;
   - whether linked to identity;
   - whether used for tracking.
7. Publish updated privacy responses if the app’s data practices change later.


## Bundled privacy manifest

The iOS target now includes `ArtFlowCreative/PrivacyInfo.xcprivacy`.

It declares:
- Tracking: **No**
- Tracking domains: none
- Required-reason APIs: none currently used
- Collected data purpose: **App Functionality**
- Used for tracking: **No** for every declared data type
- Linked to user: **Yes** for the declared account/business data

Declared collected-data categories:
- Name
- Email Address
- Phone Number
- Physical Address
- Other Financial Info
- Emails or Text Messages
- Photos or Videos
- Other User Content
- User ID
- Purchase History

These declarations are intentionally conservative and reflect the current app/storefront/inbox functionality.

The App Store Connect privacy questionnaire should match these declarations unless the production data flow changes before submission.

## Native SDK/privacy-manifest audit

The current Xcode target contains the Art Flow Swift source plus Apple system frameworks such as UIKit, WebKit, and StoreKit. No third-party native SDK binary from Apple's “SDKs that require a privacy manifest and signature” list was found in the Xcode target.

The web application uses server/web dependencies separately; re-audit this section if a native analytics, advertising, crash-reporting, authentication, payments, or cross-platform SDK is later added to the iOS target.

## Required-reason API audit

Repository search found no current direct use of:
- UserDefaults / NSUserDefaults
- system uptime APIs
- disk-space APIs
- file timestamp APIs
- other currently audited required-reason API calls in the Art Flow native Swift files

The iOS preflight validates that `PrivacyInfo.xcprivacy` exists, is valid XML, and is included in the app target resources.
