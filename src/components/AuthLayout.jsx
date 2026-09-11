import React from "react";
import { Link } from "react-router-dom";
import Logo from "@/components/Logo";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md screen-slide">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center rounded-3xl mb-5">
            <Logo size={56} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Art Flow Creative
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground mt-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
        <div className="bg-card rounded-[22px] shadow-[0_16px_48px_rgba(0,0,0,0.18)] border border-[hsl(var(--border))] p-7 sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/privacy-policy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
          <Link to="/terms-of-service" className="hover:text-foreground hover:underline">Terms of Service</Link>
          <Link to="/support" className="hover:text-foreground hover:underline">Support</Link>
        </div>
      </div>
    </div>
  );
}