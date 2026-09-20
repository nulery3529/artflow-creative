import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = "Privacy Policy | Art Flow Creative";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "How Art Flow Creative collects, uses, and protects account and business data.");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary hover:underline">Art Flow Creative</Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: September 20, 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-7">
          <section>
            <p>
              Art Flow Creative is a business-management platform for independent sellers and artists. This policy explains what information the service may process and how it is used.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Information we may collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account and profile information, such as your name and email address.</li>
              <li>Business records you enter or import, including products, listings, orders, inventory, expenses, mileage, and reports.</li>
              <li>Marketplace connection information for supported services you choose to use.</li>
              <li>Technical and security information such as request logs and error data used to operate and protect the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">How we use information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To authenticate your account and maintain your session.</li>
              <li>To store, display, calculate, and organize your business records.</li>
              <li>To import or synchronize supported marketplace data when you request those features.</li>
              <li>To provide reports, exports, backups, and business calculations.</li>
              <li>To prevent fraud, investigate errors, and keep the service secure.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Third-party services</h2>
            <p>
              Art Flow Creative may interact with supported marketplaces and service providers needed to operate the app, such as hosting, database, email-delivery, and payment providers. Those services are governed by their own privacy terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Data retention and deletion</h2>
            <p>
              Business records are retained while your account is active or as needed to provide the service. You may request deletion of your account or associated data at any time through the Account screen or by contacting support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Security</h2>
            <p>
              We use reasonable technical and organizational safeguards to protect the information we process. No internet service can guarantee absolute security, so keep your login credentials private.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Children</h2>
            <p>Art Flow Creative is intended for business use and is not directed to children under 13.</p>
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
              For privacy questions or data requests, contact{" "}
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
