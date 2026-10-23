"use client";

// Lease payments with the shopper's sales tax. Signed-in shoppers only: the
// rate comes from the ZIP on their account (/api/tax-rate, lib/sales-tax.ts)
// and they can change it here. Signed-out visitors are invited to log in.
// California ZIPs only (see lib/sales-tax.ts); always labeled an estimate.
import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { useCustomerSession } from "@/components/CustomerSession";
import { formatCurrency } from "@/lib/deal-utils";
import { monthlyWithTax } from "@/lib/tax-math";
import type { Deal } from "@/lib/deals-data";
import type { ZipTaxRate } from "@/lib/sales-tax";
import { setTaxZipAction } from "@/app/tax-actions";

interface TaxRateState {
  // "signed-out": a visitor (show the log-in invite); "none": a broker or
  // admin, or still loading (show nothing).
  status: "signed-out" | "none" | "ready";
  info: ZipTaxRate | null;
  setZip: (zip: string) => Promise<string | null>;
}

const TaxRateContext = createContext<TaxRateState>({ status: "none", info: null, setZip: async () => null });

export function useTaxRate(): TaxRateState {
  return useContext(TaxRateContext);
}

export function TaxRateProvider({ children }: { children: React.ReactNode }) {
  const session = useCustomerSession();
  const sessionStatus = session?.status ?? "loading";
  const [info, setInfo] = useState<ZipTaxRate | null>(null);

  useEffect(() => {
    if (sessionStatus !== "customer") return;
    let cancelled = false;
    fetch("/api/tax-rate", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ZipTaxRate | null) => {
        if (!cancelled && data && typeof data.zip === "string") setInfo(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  const setZip = useCallback(async (zip: string) => {
    const result = await setTaxZipAction(zip);
    if (result.info) setInfo(result.info);
    return result.error;
  }, []);

  const status: TaxRateState["status"] =
    sessionStatus === "anonymous" ? "signed-out" : sessionStatus === "customer" && info ? "ready" : "none";
  return (
    <TaxRateContext.Provider value={{ status, info: status === "ready" ? info : null, setZip }}>
      {children}
    </TaxRateContext.Provider>
  );
}

function rateLabel(info: ZipTaxRate): string {
  return `${info.rate}% ${info.approximate ? "est. " : ""}tax in ${info.place} (${info.zip})`;
}

// Under a card's monthly payment: "≈ $659/mo with tax".
export function CardTaxLine({ deal }: { deal: Deal }) {
  const { info } = useTaxRate();
  if (!info?.rate) return null;
  const total = monthlyWithTax(deal, info.rate);
  if (total == null) return null;
  return (
    <p className="mt-1 text-[13px] text-fg-secondary" title={`Estimated with ${rateLabel(info)}`}>
      ≈ <strong className="font-semibold text-fg">{formatCurrency(total)}/mo</strong> with tax
    </p>
  );
}

function ZipForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const { setZip } = useTaxRate();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const err = await setZip(value);
          if (err) setError(err);
          else onDone();
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
        inputMode="numeric"
        autoComplete="postal-code"
        aria-label="ZIP code"
        className="input h-8 w-24 text-sm"
        autoFocus
      />
      <button type="submit" disabled={pending || value.length !== 5} className="btn btn-primary btn-sm">
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onDone} className="btn btn-ghost btn-sm">
        Cancel
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
      <span className="w-full text-xs text-fg-muted">This also updates the ZIP on your account.</span>
    </form>
  );
}

// The line above the deals grid: whose tax the payments include, with
// "Change", or the log-in invite.
export function TaxZipBar({ className = "" }: { className?: string }) {
  const { status, info } = useTaxRate();
  const [editing, setEditing] = useState(false);
  if (status === "signed-out") {
    return (
      <p className={`text-sm text-fg-secondary ${className}`}>
        <MapPin className="mr-1 inline size-3.5 align-[-2px]" />
        <Link href="/customer/login" className="link">
          Log in
        </Link>{" "}
        to see payments with your local sales tax.
      </p>
    );
  }
  if (status !== "ready" || !info) return null;
  if (editing) {
    return (
      <div className={className}>
        <ZipForm initial={info.zip} onDone={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <p className={`text-sm text-fg-secondary ${className}`}>
      <MapPin className="mr-1 inline size-3.5 align-[-2px]" />
      {info.rate
        ? `Payments shown with ${rateLabel(info)}.`
        : `We can only estimate tax for California ZIPs (yours is ${info.zip}).`}{" "}
      <button type="button" onClick={() => setEditing(true)} className="link">
        Change ZIP
      </button>
    </p>
  );
}

// The deal page's payment with tax, below the payment breakdown.
export function DealTaxBox({ deal }: { deal: Deal }) {
  const { status, info } = useTaxRate();
  const [editing, setEditing] = useState(false);
  if (deal.onePay) return null;
  if (status === "signed-out") {
    return (
      <p className="mt-3 text-sm text-fg-secondary">
        <MapPin className="mr-1 inline size-3.5 align-[-2px]" />
        <Link href="/customer/login" className="link">
          Log in
        </Link>{" "}
        to see this payment with your local sales tax.
      </p>
    );
  }
  if (status !== "ready" || !info) return null;
  const total = info.rate ? monthlyWithTax(deal, info.rate) : null;
  return (
    <div className="mt-3 rounded-[3px] border border-line bg-raised px-4 py-3 text-sm">
      {editing ? (
        <ZipForm initial={info.zip} onDone={() => setEditing(false)} />
      ) : (
        <>
          {total != null ? (
            <p>
              <span className="text-fg-secondary">With your tax: </span>
              <strong className="text-base font-semibold text-fg">≈ {formatCurrency(total)}/mo</strong>
            </p>
          ) : (
            <p className="text-fg-secondary">We can only estimate tax for California ZIPs (yours is {info.zip}).</p>
          )}
          <p className="mt-1 text-xs text-fg-muted">
            {total != null && `${rateLabel(info)}. `}
            {deal.paymentTaxRate ? `The seller's price included ~${deal.paymentTaxRate}% tax; we swapped in yours. ` : ""}
            Monthly payment only, an estimate; due at signing is taxed too, and the seller confirms the final
            numbers.{" "}
            <button type="button" onClick={() => setEditing(true)} className="link">
              Change ZIP
            </button>
          </p>
        </>
      )}
    </div>
  );
}
