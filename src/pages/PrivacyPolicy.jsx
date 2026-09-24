import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = "Privacy Policy | Art Flow Creative";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "How Art Flow Creative collects, uses, and protects your business data, including Gmail and marketplace integrations.");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary hover:underline">Art Flow Creative</Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: September 24, 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-7">
          <section>
            <p>
              Art Flow Creative is a business-management platform for independent sellers and artists. This Privacy Policy explains, in practical terms, what information Art Flow may collect and how it is used — including when you connect Google or marketplace services such as Etsy, eBay, Depop, Vinted, and Poshmark.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Information we may collect</h2>
            <p>Depending on the features you use, Art Flow Creative may process:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Account and profile information, such as your name and email address.</li>
              <li>Business information you enter, such as products, listings, orders, inventory, and expenses.</li>
              <li>Marketplace connection information for services you choose to connect.</li>
              <li>Google account authorization information created when you approve a Google connection.</li>
              <li>Email metadata and content, only when you explicitly authorize Gmail access or inbound email processing.</li>
              <li>OAuth tokens and connection credentials, which are stored securely on the server and are not shared with other users.</li>
              <li>Technical, logging, and security information, such as request logs and error information used to keep the service running.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">How we use information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Syncing marketplace orders, listings, and inventory for the connections you authorize.</li>
              <li>Creating reports and business calculations you request.</li>
              <li>Performing Google Sheets or Google Drive functions you explicitly request, such as updating a linked spreadsheet.</li>
              <li>Authenticating you and handling password resets.</li>
              <li>Ingesting emails, orders, and expenses when you authorize that processing.</li>
              <li>Security, fraud prevention, and error monitoring.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">How integrations work</h2>
            <p>
              Art Flow Creative connects to third-party services — including Google Gmail, Etsy, eBay, Depop, Vinted, Poshmark, Resend, and Neon PostgreSQL — to provide the features you request. Those services process data under their own privacy policies. Art Flow does not sell your data, and advertisers do not receive your private conversations or your business data through this app. Google user data is used only to provide the features you authorize, and you can disconnect any integration at any time from the app or from the third party's own settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Google API data</h2>
            <p>
              Art Flow Creative may request read-only access to Gmail only when you explicitly connect a Gmail inbox. Google data is used solely to provide the Art Flow functionality you requested — for example, reading marketplace sale messages and business receipt or expense emails you choose to import. We do not use Google user data for advertising and we do not sell Google user data. Art Flow Creative's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements. You can review or revoke Art Flow Creative's access at any time in your Google account settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Data retention and deletion</h2>
            <p>
              Business records are retained while your account is active or as needed to provide the service. Signed-in users can permanently delete their Art Flow account and associated business data from Account → Delete Account. You may also contact us at the email below for privacy or deletion questions. Certain limited records may be retained when required for legal, security, fraud-prevention, or accounting obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Security</h2>
            <p>
              We use reasonable technical and organizational safeguards to protect the information we process. Each signed-in user accesses their own account's records. However, no internet service can guarantee absolute security, so please keep your login credentials safe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Children</h2>
            <p>
              Art Flow Creative is intended for business use and is not directed to children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Changes to this policy</h2>
            <p>
              This policy may be updated as Art Flow Creative changes. The "Last updated" date above will be revised when material updates are made.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contact</h2>
            <p>
              For privacy questions or data requests, contact us at{" "}
              <a href="mailto:help@artflowcreative.com" className="text-primary hover:underline">help@artflowcreative.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-border pt-6 flex flex-wrap gap-4 text-sm">
          <Link to="/support" className="text-primary hover:underline">Support</Link>
          <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/login" className="text-primary hover:underline">Return to login</Link>
        </div>
      </div>
    </main>
  );
}
