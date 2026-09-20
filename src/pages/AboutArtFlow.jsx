import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function AboutArtFlow() {
  useEffect(() => {
    document.title = "Art Flow Creative | Business Management for Independent Sellers";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Art Flow Creative helps independent artists and online sellers organize sales, expenses, inventory, reports, and marketplace activity.");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="space-y-4">
          <p className="text-sm font-semibold text-primary">Art Flow Creative</p>
          <h1 className="text-4xl font-bold tracking-tight">Business management for independent artists and online sellers</h1>
          <p className="text-base leading-7 text-muted-foreground">
            Art Flow Creative helps sellers organize sales, expenses, inventory, marketplace activity, reports, and business records in one place.
          </p>
        </header>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold">Your business records stay in Art Flow</h2>
          <p className="text-sm leading-7">
            Art Flow Creative uses its own account system and database. Marketplace records, expenses, inventory, reports, and manual sale entries are stored in the Art Flow workspace associated with your account.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold">Marketplace tools</h2>
          <p className="text-sm leading-7">
            Supported marketplace features can import or organize data from services such as Etsy, eBay, Depop, Vinted, and Poshmark. Availability depends on each marketplace and may change over time.
          </p>
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
