# Art Flow Creative — TestFlight Launch Checklist

Use this checklist after the first signed App Store Connect build is uploaded.

## Before inviting testers

Confirm in App Store Connect:
- Monthly subscription exists: `com.artflowcreative.app.monthly`.
- Yearly subscription exists: `com.artflowcreative.app.yearly`.
- US launch targets are $9.99/month and $79.99/year.
- 7-day introductory free trial is configured as intended.
- Both subscriptions belong to the same subscription group.
- Subscription localization and review screenshots are complete.
- Sign in with Apple capability/service ID/key are configured.
- Production Apple environment variables are present.
- App Privacy questionnaire is complete.
- Age Rating questionnaire is complete.
- Support, Privacy Policy, and Terms URLs are entered.

## Fresh-install test

On an iPhone with no prior Art Flow install:

1. Install from TestFlight.
2. Confirm launch screen is dark-purple and no blank white screen flashes.
3. Confirm loading indicator appears only while the site loads.
4. Turn on Airplane Mode and relaunch:
   - native offline screen appears;
   - Try Again button works after network returns.
5. Confirm pull-to-refresh works after login.
6. Confirm external marketplace/support links open outside the Art Flow WebView.

## Account creation

Test a brand-new email/password account:
- Create Account is visible from login.
- Registration succeeds.
- New user receives a new Art Flow workspace.
- New user does not see another user's records.
- Forgot Password sends the reset email.
- Reset link returns to the production Art Flow domain.
- New password works.

## Sign in with Apple

After Apple credentials are configured:
- Continue with Apple appears.
- Apple sign-in succeeds.
- A new Apple user reaches the correct Art Flow workspace.
- Signing in again returns to the same account.
- If the Apple email matches an existing trusted Art Flow account, account linking behaves correctly.
- Hide My Email flow does not expose another user's data.
- Canceling the Apple sign-in sheet returns cleanly to login.

## Google / Gmail

- Continue with Google still works.
- Gmail connection requests read-only Gmail access only.
- Gmail sales sync completes.
- Gmail expense sync completes.
- No Google Drive/Sheets permission is requested.
- Background sync still works after closing the browser/app.
- Reconnect message appears cleanly if Google authorization is revoked.

## Yahoo

- Connect Yahoo using an app password.
- Connection test succeeds.
- Expense receipts import correctly.
- Seller-order emails can become sales when appropriate.
- Listings/activity/buyer-order emails do not become fake sales.
- Disconnect removes the stored Yahoo app-password credential.

## Marketplace/order checks

Use controlled sample/test data where possible.

Verify:
- Vinted orders.
- Depop orders.
- Poshmark orders.
- eBay official connection when available.
- Etsy state when no orders exist.
- Canceled orders are not counted as active sales.
- No duplicate order IDs.
- Dashboard totals match Orders.
- Marketplace performance totals match underlying orders.

## Expenses

Verify:
- Manual expense entry.
- Gmail-imported expense.
- Yahoo-imported expense.
- Category.
- Amount.
- Date.
- Notes/description.
- Delete/edit behavior.
- Dashboard/report totals update correctly.

## Inventory / products

Verify:
- Add product.
- Upload image.
- Save image.
- Download/export image where supported.
- Available/Sold toggle.
- Sold history.
- Edit product.
- Delete product.

## Reports / export

Verify:
- Sales export.
- Expense export.
- In the iOS build, export opens the native iOS share sheet.
- Save to Files works.
- AirDrop target appears when available.
- Mail/Messages share targets work when installed.
- Browser/web fallback still downloads normally outside the iOS wrapper.

## Mileage / business tools

Verify:
- Add mileage.
- Edit mileage.
- Delete mileage.
- Deduction calculation.
- Business planning data saves.
- Schedule/calendar records save if used.

## StoreKit subscription flow

Use Apple Sandbox/TestFlight purchase testing.

### Monthly
- Product loads from StoreKit.
- Localized price displays.
- Eligible 7-day trial text displays.
- Purchase succeeds.
- App unlocks immediately after entitlement is active.

### Yearly
- Product loads.
- Localized price displays.
- Eligible trial wording is correct.
- Purchase succeeds.
- App unlocks.

### Restore
- Delete/reinstall app.
- Sign into the same Apple account.
- Restore Purchases restores entitlement.

### Other StoreKit states
- User cancels purchase sheet.
- Purchase is pending.
- Subscription expires.
- Subscription is canceled but remains active through paid period.
- Manage Apple Subscription opens Apple's management UI.
- App never invents/hard-codes a localized StoreKit price.

## Paywall/legal

From the paywall:
- Monthly and Yearly options are readable.
- Auto-renew language is visible.
- Trial wording is accurate.
- Restore Purchases is visible.
- Terms of Service opens.
- Privacy Policy opens.
- Support email/link works.

## Account deletion

Use a disposable test account.

For a sole-owner workspace:
- Delete Account requires confirmation.
- Art Flow-owned business data is removed.
- Login account is removed.
- Deleted user can no longer sign in with the old credentials.
- Apple subscription is **not** falsely represented as canceled; user is told Apple billing must be managed separately.

For a shared workspace:
- Other linked user keeps the shared workspace.
- Deleted user loses access.
- Deleted user's standalone data is removed as designed.

## Public URLs

Verify from Safari without signing in:
- https://artflowcreative.com/support
- https://artflowcreative.com/privacy-policy
- https://artflowcreative.com/terms-of-service
- https://artflowcreative.com/register
- https://artflowcreative.com/login

All should load with HTTP 200 and usable content.

## iPad

Because the current target supports iPad:
- Install TestFlight build on iPad or iPad simulator.
- Check portrait.
- Check landscape.
- Dashboard fits.
- Navigation fits.
- Paywall fits.
- Account screen fits.
- Share sheet anchors correctly and does not crash.
- No important controls are clipped.

## App Review demo pass

Run the exact reviewer walkthrough from `APP_STORE_SUBMISSION.md` using a clean demo/reviewer account.

Do not submit until:
- no blocking runtime errors;
- no broken login path;
- no broken purchase/restore path;
- no missing legal URL;
- no real customer/private data in screenshots;
- no unexplained blank WebView states.
