import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import TrackerSetupCard from "@/components/TrackerSetupCard";
import BusinessManager from "@/components/BusinessManager";

export default function NewUserSetup() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <PageHeader title="Set up Art Flow" subtitle="Create your tracker and connect business email" />

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl pastel-peach flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-xl">Your business workspace is ready</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create your ArtFlow Creative Tracker with the Google account you want to use. That Google connection also requests Gmail read-only access so Art Flow can use the same business inbox for supported email syncing.
            </p>
          </div>
        </div>
      </section>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">Step 1</p>
        <TrackerSetupCard callbackPath="/setup" />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">Step 2</p>
        <BusinessManager />
      </div>

      <section className="bg-muted/50 rounded-3xl p-4 border border-[hsl(var(--border))]">
        <p className="text-sm font-semibold">Expense email setup</p>
        <p className="text-xs text-muted-foreground mt-1">
          Under Business workspace, add every email address you use to buy supplies or pay business expenses. Your main account email is included automatically. You can change these later in Account settings.
        </p>
      </section>

      <button
        type="button"
        onClick={() => navigate("/", { replace: true })}
        className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        Continue to Art Flow <ArrowRight className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => navigate("/", { replace: true })}
        className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold"
      >
        Skip for now
      </button>
    </div>
  );
}
