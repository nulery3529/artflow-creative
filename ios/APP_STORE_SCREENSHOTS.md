# Art Flow Creative — App Store Screenshot Plan

Prepared for first iOS/iPadOS submission.

The current Xcode target supports both iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`), so plan for both device families unless the first release is intentionally changed to iPhone-only.

## Apple file requirements

Screenshots:
- JPEG/JPG/PNG.
- No transparency/alpha.
- 1 to 10 screenshots per device set.

### Recommended iPhone master set

Use a current 6.9-inch portrait size accepted by App Store Connect:
- 1320 × 2868 px, or
- 1290 × 2796 px, or
- 1260 × 2736 px.

If the UI is the same on smaller iPhones, App Store Connect can scale the high-resolution set.

### Recommended iPad master set

Because the app currently runs on iPad, prepare a 13-inch portrait set:
- 2064 × 2752 px, or
- 2048 × 2732 px.

App Store Connect can scale these for smaller iPad sizes when the interface is the same.

## Privacy rule for screenshots

Do **not** use the owner’s real orders, customer names, emails, addresses, sales totals, receipts, or connected-account credentials.

Use:
- a clean demo/reviewer account; or
- intentionally created sample business records.

Avoid showing:
- buyer names;
- personal email addresses;
- order IDs tied to real customers;
- Yahoo app passwords;
- OAuth details;
- private receipt text.

## Recommended screenshot sequence

### 1 — Dashboard

**Headline:** Your art business, in one place

Show:
- modern Art Flow dashboard;
- sales/order overview;
- expense/profit summary;
- marketplace performance.

Keep the screen uncluttered and use sample values.

### 2 — Orders

**Headline:** Track marketplace sales automatically

Show:
- current-year order history;
- marketplace labels;
- product, quantity, size, and total;
- clean sold/order organization.

Use sample Vinted/Depop/Poshmark/eBay-style data, not real buyer data.

### 3 — Expenses

**Headline:** Keep business expenses organized

Show:
- expense history;
- categories;
- receipt/import source;
- totals.

Use sample expenses such as paper, ink, mailers, postage, software, and equipment.

### 4 — Inventory / Products

**Headline:** Know what’s available and what sold

Show:
- product record;
- available/sold state;
- image;
- title/description/hashtags or inventory cost data.

Use Art Flow-owned/demo artwork.

### 5 — Reports

**Headline:** See sales, costs, and profit clearly

Show:
- report or summary view;
- revenue;
- expenses;
- estimated profit;
- marketplace breakdown.

Do not advertise tax estimates as professional tax advice.

### 6 — Mileage + business tools

**Headline:** Keep the rest of your business organized too

Show one strong screen:
- mileage tracking; or
- business planning/calendar.

Avoid trying to show multiple tiny screens in one screenshot.

### 7 — Connected marketplaces

**Headline:** Bring your selling channels together

Show Account/integration area with:
- Gmail;
- Yahoo;
- eBay;
- marketplace tracking controls.

Use disconnected/demo states unless test credentials are safe to show.

### 8 — Native iPhone export

**Headline:** Export and share from your iPhone

Show:
- Art Flow Export control;
- iOS native share sheet open with safe sample CSV export.

This demonstrates a native iOS integration beyond the hosted business UI.

### Optional 9 — Subscription

**Headline:** Simple plans for your business

Show the StoreKit paywall once real products exist:
- Monthly;
- Yearly;
- 7-day trial when eligible;
- localized Apple price;
- Restore Purchases;
- Terms and Privacy.

Do not mock the Apple price. Capture the real StoreKit sandbox/TestFlight UI after products are configured.

### Optional 10 — Account controls

**Headline:** Your account and data stay in your control

Show:
- support;
- Manage Apple Subscription;
- Delete Account;
- theme/settings.

Do not open the destructive confirmation sheet unless the screenshot needs it.

## Visual style

Use the actual Art Flow interface rather than marketing mockups whenever possible.

Recommended:
- portrait orientation;
- same theme across one screenshot set;
- dark-purple Art Flow styling for the primary set;
- readable sample values;
- no excessive callout arrows;
- short headline only;
- consistent typography and margins.

A second localization/theme set is optional.

## iPad notes

Use the same content order as iPhone, but capture true iPad layouts rather than stretching iPhone screenshots.

Verify before capture:
- navigation fits;
- cards do not become excessively wide;
- modal/paywall widths are comfortable;
- landscape is not needed for the product-page set unless it presents the app better.

## Capture checklist

Before final screenshots:
1. Real subscription products exist in App Store Connect.
2. Demo/sample account contains no private customer data.
3. Dashboard totals are internally consistent.
4. No error banners or loading states.
5. Marketplace integrations do not expose tokens/credentials.
6. Status bar time/battery are acceptable.
7. Native export/share screenshot uses a harmless sample file.
8. Save original full-resolution PNG/JPEG files.
