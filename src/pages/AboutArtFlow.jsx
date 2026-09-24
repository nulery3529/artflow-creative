import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function AboutArtFlow() {
  useEffect(() => {
    document.title = "Art Flow Creative | Business Management for Independent Sellers";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Art Flow Creative helps independent artists and online sellers organize sales, expenses, inventory, reports, and authorized marketplace and Google integrations.");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="space-y-4">
          <p className="text-sm font-semibold text-primary">Art Flow Creative</p>
          <h1 className="text-4xl font-bold tracking-tight">Business management for independent artists and online sellers</h1>
          <p className="text-base leading-7 text-muted-foreground">
            Art Flow Creative helps independent artists and online sellers organize marketplace sales, business expenses, inventory, mileage, reports, and day-to-day business records in one place.
          </p>
        </header>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold">How Google connections are used</h2>
          <p className="text-sm leading-7">
            Google connections are optional and are started only by the user. When authorized, Art Flow Creative uses Gmail read-only access to identify supported marketplace sale confirmations and business receipt emails so the user can import those records into a private Art Flow Creative business workspace.
          </p>
          <p className="text-sm leading-7">
            Art Flow Creative does not send, modify, or delete Gmail messages. Google user data is not used for advertising or sold. Users can revoke Google access from their Google Account or disconnect the inbox from Art Flow Creative.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold">Your account stays separate from Google</h2>
          <p className="text-sm leading-7">
            Art Flow Creative uses its own email-and-password account system. Connecting Google is optional and is used only for the Google-powered features a user chooses to enable.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold">What Art Flow Creative includes</h2>
          <ul className="grid gap-3 text-sm leading-6 sm:grid-cols-2">
            <li className="rounded-2xl border border-border p-4">Marketplace order and sales tracking</li>
            <li className="rounded-2xl border border-border p-4">Business expense and receipt tracking</li>
            <li className="rounded-2xl border border-border p-4">Inventory and product records</li>
            <li className="rounded-2xl border border-border p-4">Mileage, reports, and planning tools</li>
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/login" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Log in</Link>
          <Link to="/register" className="rounded-xl border border-border px-5 py-3 text-sm font-semibold">Create account</Link>
        </div>

        <footer className="mt-12 border-t border-border pt-6 flex flex-wrap gap-4 text-sm">
          <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/terms-of-service" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/support" className="text-primary hover:underline">Support</Link>
        </footer>
      </div>
    </main>
  );
}
