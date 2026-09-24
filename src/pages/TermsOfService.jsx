import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function TermsOfService() {
  useEffect(() => {
    document.title = "Terms of Service | Art Flow Creative";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "The rules for using Art Flow Creative, including marketplace integrations, acceptable use, and your rights.");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-primary hover:underline">Art Flow Creative</Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: September 24, 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-7">
          <section>
            <h2 className="text-xl font-semibold mb-2">Acceptance of these terms</h2>
            <p>
              These Terms of Service govern your use of Art Flow Creative, a business-management platform for independent sellers and artists. By creating an account or using the service, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Eligibility and your account</h2>
            <p>
              You must be able to form a binding contract to use Art Flow Creative. You are responsible for the accuracy of the information you provide, for keeping your login credentials secure, and for activity that occurs through your account. Report suspected unauthorized access promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Marketplace and third-party integrations</h2>
            <p>
              Art Flow Creative may let you connect services such as Google Gmail, Yahoo Mail, Etsy, eBay, Depop, Vinted, and Poshmark. Connections are optional. When you authorize a connection, you permit Art Flow Creative to access your connected account only to provide the functionality you requested. You remain responsible for following each marketplace's own rules and policies, and third-party services are governed by their own terms.
            </p>
            <p className="mt-2">
              Marketplaces do not all support identical capabilities. Where direct API access is unavailable — for example for some Vinted, Depop, or Poshmark features — Art Flow Creative relies on reports, email imports, or manual entry, which may be less complete than direct sync. Order, listing, and inventory synchronization may also be delayed or incomplete due to provider outages, rate limits, or restrictions outside our control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Subscriptions and fees</h2>
            <p>
              Some Art Flow Creative features require a paid subscription. The available plan, localized price, billing period, and any eligible introductory offer are shown before purchase. On iOS, subscriptions are purchased through Apple's in-app purchase system and are charged to your Apple Account.
            </p>
            <p className="mt-2">
              Auto-renewable subscriptions continue until canceled. If an introductory free trial is offered and you are eligible, the subscription converts to the displayed paid plan when the trial ends unless you cancel before renewal. You can manage or cancel an Apple subscription in your Apple Account subscription settings. Restoring an eligible prior purchase is available from the Art Flow subscription screen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Acceptable use</h2>
            <p>You may not misuse Art Flow Creative. Prohibited uses include:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Attempting to gain unauthorized access to another user's account or data.</li>
              <li>Bypassing or attempting to bypass marketplace security measures.</li>
              <li>Scraping, automated access, or bulk data collection that violates a marketplace's terms of service.</li>
              <li>Interfering with the service, uploading malicious code, or using the app for unlawful activity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Your business data and our software</h2>
            <p>
              You retain ownership of the business information and content you provide to Art Flow Creative — we do not own it. You grant the service permission to process that information only as needed to operate, synchronize, display, back up, and support the features you use. The Art Flow Creative application, its design, and its software are owned by Art Flow Creative and protected by intellectual-property law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Third-party links and services</h2>
            <p>
              The service may reference or connect to third-party websites and services. Those are governed by their own terms, and we are not responsible for their content or practices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Availability and disclaimers</h2>
            <p>
              Features may be updated, added, changed, or discontinued as Art Flow Creative evolves. The service is provided on an "as is" and "as available" basis to the extent permitted by law. No warranty is made that every feature will be error-free or that imported third-party data will always be complete, current, or accurate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Business calculations</h2>
            <p>
              Totals, profit estimates, tax estimates, inventory calculations, and reports are organizational tools, not legal, tax, accounting, or financial advice. Review your records and consult a qualified professional where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Limitation of liability</h2>
            <p>
              To the extent permitted by law, Art Flow Creative and its owner will not be liable for indirect, incidental, special, consequential, or business-loss damages arising from use of, or inability to use, the service, third-party service interruptions, or inaccurate information supplied by users or connected services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Suspension and termination</h2>
            <p>
              You may stop using the service at any time. Access may be suspended or terminated for misuse, security risks, unlawful activity, or material violations of these terms. You can permanently delete your Art Flow account and associated owned business data from the app's Account screen. Deleting an Art Flow account does not cancel an Apple subscription; Apple subscriptions must be managed or canceled separately through Apple's subscription settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Changes to the service or these terms</h2>
            <p>
              These terms may be updated as the service changes; the "Last updated" date will be revised when material changes are made. Continued use after updated terms take effect constitutes acceptance of the revised terms where permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Governing law</h2>
            <p>
              These terms are governed by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contact</h2>
            <p>
              Questions about these Terms of Service may be directed to{" "}
              <a href="mailto:help@artflowcreative.com" className="text-primary hover:underline">help@artflowcreative.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-border pt-6 flex flex-wrap gap-4 text-sm">
          <Link to="/support" className="text-primary hover:underline">Support</Link>
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/login" className="text-primary hover:underline">Return to login</Link>
        </div>
      </div>
    </main>
  );
}
