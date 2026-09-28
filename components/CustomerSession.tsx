"use client";

// Who's browsing the consumer site, as the browser sees it — signed out, a
// customer, or a signed-in broker/admin account — plus the customer's saved
// deals (supabase/migrations/0016_saved_deals.sql). Mounted once in
// components/SiteChrome.tsx and switched on for the consumer site only (not
// the /broker portal), so any Client Component there can ask "is this deal
// saved?" or "who's signed in?" without its own round trip. Built to grow:
// the account email is already here for features that need it (e.g.
// emailing matches).
//
// Everything goes through the browser Supabase client with the visitor's
// own session, so Row Level Security scopes reads and writes to their own
// rows whatever this code asks for. Reads degrade gracefully: the site
// deploys before the owner runs the migration, so if saved_deals can't be
// read at all, savedDealsAvailable goes false and the hearts hide.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { CircleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/supabase/with-timeout";

// "non-customer": signed in as a broker or admin (no customers row).
// "unknown": couldn't tell who's signed in — the auth server or database
// didn't answer — so nothing customer-specific is offered. Checked again
// when the tab comes back into view or the connection comes back.
export type CustomerSessionStatus = "loading" | "anonymous" | "customer" | "non-customer" | "unknown";

export type ToggleSavedResult = { ok: true; saved: boolean } | { ok: false; error: string };

export interface CustomerSession {
  status: CustomerSessionStatus;
  // The signed-in account's email (customer or not); null when signed out,
  // still loading, or not known.
  email: string | null;
  savedDealIds: ReadonlySet<string>;
  // False when saved deals can't be read at all (e.g. the table doesn't
  // exist yet) — the save buttons hide themselves.
  savedDealsAvailable: boolean;
  isSaved: (dealId: string) => boolean;
  // True while a save/remove for this deal is still on its way to the
  // database; further taps on it are ignored until it settles.
  isSavePending: (dealId: string) => boolean;
  // Optimistic: flips the heart immediately, then rolls it back and shows
  // an error notice if the database rejects the change.
  toggleSaved: (dealId: string) => Promise<ToggleSavedResult>;
  // Re-reads the session and saved deals (e.g. after a server action).
  refresh: () => void;
}

interface LoadedSession {
  status: CustomerSessionStatus;
  userId: string | null;
  email: string | null;
  savedDealIds: ReadonlySet<string>;
  savedDealsAvailable: boolean;
}

interface SessionState extends LoadedSession {
  // The header account (see accountKey) this was read for. What was read
  // for a different account is stale, so it's shown as still loading until
  // the re-read lands — not as the previous account's hearts.
  forAccount: string | null | undefined;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

const INITIAL_STATE: SessionState = {
  // Matches no accountKey, so this always reads as "loading".
  forAccount: undefined,
  status: "loading",
  userId: null,
  email: null,
  savedDealIds: EMPTY_IDS,
  // Assumed until a read says otherwise, so the hearts don't pop in late
  // for the (normal) case where everything works.
  savedDealsAvailable: true,
};

// PostgREST's default page size; far more than anyone saves, and bounded by
// the number of published deals anyway (one row per customer per deal).
const SAVED_IDS_LIMIT = 1000;

// How long an error notice stays up before clearing itself.
const NOTICE_MS = 8000;

// deals.id is a uuid — anything else can't be saved, so no request is made
// and the heart isn't shown for it.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSaveableDealId(dealId: unknown): dealId is string {
  return typeof dealId === "string" && UUID_RE.test(dealId);
}

const SAVE_ERROR = "We couldn't save this deal. Please try again.";
const REMOVE_ERROR = "We couldn't remove this deal from your saved deals. Please try again.";

function friendlySaveError(code: string | undefined, removing: boolean): string {
  switch (code) {
    // Table/column missing — the migration hasn't been run yet.
    case "42P01":
    case "42703":
    case "PGRST204":
    case "PGRST205":
      return "Saved deals aren't available yet. Please try again later.";
    // The access token was rejected.
    case "PGRST301":
    case "PGRST302":
      return "Your session has ended. Log in again to save deals.";
    // RLS refused the insert: signed out since the page loaded, or the deal
    // is no longer published (only published deals can be saved).
    case "42501":
      return removing
        ? REMOVE_ERROR
        : "This deal couldn't be saved. It may no longer be listed, or you may need to log in again.";
    // Foreign key: the deal has been deleted.
    case "23503":
      return "This deal is no longer listed, so it can't be saved.";
    default:
      return removing ? REMOVE_ERROR : SAVE_ERROR;
  }
}

function withDeal(ids: ReadonlySet<string>, dealId: string, saved: boolean): ReadonlySet<string> {
  if (ids.has(dealId) === saved) return ids;
  const next = new Set(ids);
  if (saved) next.add(dealId);
  else next.delete(dealId);
  return next;
}

type SignedInUser = { id: string; email: string | null };

// Every outcome other than "customer": there are no saved deals to load.
function withoutSavedDeals(
  status: "anonymous" | "non-customer" | "unknown",
  user: SignedInUser | null,
  savedDealsAvailable = false
): LoadedSession {
  return {
    status,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    savedDealIds: EMPTY_IDS,
    savedDealsAvailable,
  };
}

// Reads everything in one pass. Never throws: a failure hides the save
// buttons (and logs why) instead of breaking the page.
async function loadSession(): Promise<LoadedSession> {
  // undefined until getUser() has answered; null once it has said
  // "signed out".
  let signedIn: SignedInUser | null | undefined;
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await withTimeout(supabase.auth.getUser(), 8000, "CustomerSession getUser");

    if (!user) {
      // No session at all comes back as AuthSessionMissingError — that's
      // just "signed out". Any other error (the auth server unreachable or
      // failing, a token refresh that didn't go through) means we can't
      // tell, and guessing "signed out" would send a signed-in customer
      // off to log in again.
      if (userError && !isAuthSessionMissingError(userError)) {
        console.error("CustomerSession getUser failed:", userError.name, userError.message);
        return withoutSavedDeals("unknown", null);
      }
      signedIn = null;

      // Nothing of theirs to load, but check the table is readable at all
      // (RLS returns no rows to a signed-out visitor) so the hearts don't
      // send people to log in for a feature that isn't there yet.
      const { error } = await withTimeout(
        supabase.from("saved_deals").select("deal_id").limit(1),
        8000,
        "CustomerSession saved deals check"
      );
      if (error) console.error("CustomerSession saved deals check failed:", error.code, error.message);
      return withoutSavedDeals("anonymous", null, !error);
    }

    signedIn = { id: user.id, email: user.email ?? null };
    const [customerResult, savedResult] = await Promise.all([
      withTimeout(
        supabase.from("customers").select("id").eq("id", user.id).maybeSingle<{ id: string }>(),
        8000,
        "CustomerSession customer lookup"
      ),
      withTimeout(
        supabase
          .from("saved_deals")
          .select("deal_id")
          .eq("customer_id", user.id)
          .limit(SAVED_IDS_LIMIT)
          .returns<{ deal_id: string }[]>(),
        8000,
        "CustomerSession saved deals"
      ),
    ]);

    // Brokers and admins sign in with the same auth but have no customers
    // row. If the lookup itself failed we can't tell either way, so saving
    // stays hidden rather than guessing.
    if (customerResult.error) {
      console.error("CustomerSession customer lookup failed:", customerResult.error.message);
      return withoutSavedDeals("unknown", signedIn);
    }
    if (!customerResult.data) return withoutSavedDeals("non-customer", signedIn);

    if (savedResult.error) {
      console.error("CustomerSession saved deals failed:", savedResult.error.code, savedResult.error.message);
    }
    const ids = new Set<string>();
    for (const row of savedResult.data ?? []) {
      if (isSaveableDealId(row?.deal_id)) ids.add(row.deal_id);
    }
    return {
      status: "customer",
      userId: user.id,
      email: signedIn.email,
      savedDealIds: ids,
      savedDealsAvailable: !savedResult.error,
    };
  } catch (err) {
    console.error("CustomerSession load threw:", err);
    // Signed out for sure, just couldn't check the table: hide the hearts.
    if (signedIn === null) return withoutSavedDeals("anonymous", null);
    return withoutSavedDeals("unknown", signedIn ?? null);
  }
}

const CustomerSessionContext = createContext<CustomerSession | null>(null);

// Null outside the provider, or where it's switched off (the /broker
// portal, including its deal preview) — callers render nothing
// customer-specific there.
export function useCustomerSession(): CustomerSession | null {
  return useContext(CustomerSessionContext);
}

export function CustomerSessionProvider({
  enabled = true,
  accountKey,
  children,
}: {
  // Off on the portal's own routes: nothing is read and the hook returns
  // null. A switch rather than leaving the provider out there, so the tree
  // above the page is the same on every route and moving between the
  // portal and the consumer site doesn't remount the page.
  enabled?: boolean;
  // Changes whenever the server-rendered header account does (signing in
  // or out goes through a server action that re-renders the layout), so
  // the session is re-read without a full page load.
  accountKey: string | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped on every (re)load so a slow response from an earlier load — or a
  // save that settles after the account changed — can't overwrite newer state.
  const generation = useRef(0);
  // Deals with a request in flight, read synchronously so a quick double
  // tap can't fire a second request before the first re-render lands.
  const pendingRef = useRef<Set<string>>(new Set());

  const current = state.forAccount === accountKey ? state : INITIAL_STATE;

  useEffect(() => {
    if (!enabled) return;
    const gen = ++generation.current;
    let active = true;
    loadSession().then((next) => {
      if (active && gen === generation.current) setState({ ...next, forAccount: accountKey });
    });
    return () => {
      active = false;
    };
  }, [enabled, accountKey, reloadToken]);

  // Signed out by the browser client itself (e.g. the refresh token was
  // revoked) — nothing else would tell this tab until the next page load.
  // createClient() throws without the Supabase env vars (e.g. a
  // misconfigured preview build); that just means no listener, not a
  // broken page.
  useEffect(() => {
    if (!enabled) return;
    try {
      const {
        data: { subscription },
      } = createClient().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") setReloadToken((t) => t + 1);
      });
      return () => subscription.unsubscribe();
    } catch (err) {
      console.error("CustomerSession auth listener failed:", err);
    }
  }, [enabled]);

  // "Couldn't tell" shouldn't need a full page load to clear up: check
  // again once the tab is back in view or the connection is back.
  const unknown = enabled && current.status === "unknown";
  useEffect(() => {
    if (!unknown) return;
    const retry = () => {
      if (document.visibilityState === "visible") setReloadToken((t) => t + 1);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [unknown]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const setPending = useCallback((dealId: string, pending: boolean) => {
    if (pending) pendingRef.current.add(dealId);
    else pendingRef.current.delete(dealId);
    setPendingIds(new Set(pendingRef.current));
  }, []);

  const toggleSaved = useCallback(
    async (dealId: string): Promise<ToggleSavedResult> => {
      const { status, userId, savedDealsAvailable, savedDealIds } = current;
      if (!isSaveableDealId(dealId)) return { ok: false, error: SAVE_ERROR };
      if (status !== "customer" || !userId) {
        return { ok: false, error: "Log in with your customer account to save deals." };
      }
      if (!savedDealsAvailable) {
        return { ok: false, error: "Saved deals aren't available yet. Please try again later." };
      }
      if (pendingRef.current.has(dealId)) {
        return { ok: false, error: "Still saving — one moment." };
      }

      const removing = savedDealIds.has(dealId);
      const gen = generation.current;
      setPending(dealId, true);
      setNotice(null);
      setState((s) => ({ ...s, savedDealIds: withDeal(s.savedDealIds, dealId, !removing) }));

      let failure: string | null = null;
      try {
        const supabase = createClient();
        const { error } = removing
          ? await withTimeout(
              supabase.from("saved_deals").delete().eq("customer_id", userId).eq("deal_id", dealId),
              10000,
              "remove saved deal"
            )
          : await withTimeout(
              supabase.from("saved_deals").insert({ customer_id: userId, deal_id: dealId }),
              10000,
              "save deal"
            );
        // A duplicate means it was already saved (another tab, say) —
        // which is exactly what was asked for.
        if (error && !(error.code === "23505" && !removing)) {
          console.error(`${removing ? "Remove saved deal" : "Save deal"} failed:`, error.code, error.message);
          failure = friendlySaveError(error.code, removing);
        }
      } catch (err) {
        console.error(`${removing ? "Remove saved deal" : "Save deal"} threw:`, err);
        failure = removing ? REMOVE_ERROR : SAVE_ERROR;
      } finally {
        setPending(dealId, false);
      }

      if (failure) {
        if (gen === generation.current) {
          setState((s) => ({ ...s, savedDealIds: withDeal(s.savedDealIds, dealId, removing) }));
          setNotice(failure);
        }
        return { ok: false, error: failure };
      }
      return { ok: true, saved: !removing };
    },
    [current, setPending]
  );

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  const value = useMemo<CustomerSession | null>(
    () =>
      enabled
        ? {
            status: current.status,
            email: current.email,
            savedDealIds: current.savedDealIds,
            savedDealsAvailable: current.savedDealsAvailable,
            isSaved: (dealId) => current.savedDealIds.has(dealId),
            isSavePending: (dealId) => pendingIds.has(dealId),
            toggleSaved,
            refresh,
          }
        : null,
    [enabled, current, pendingIds, toggleSaved, refresh]
  );

  return (
    <CustomerSessionContext.Provider value={value}>
      {children}

      {/* One shared notice for failed saves, just under the header — the
          heart itself has no room for an error message. */}
      {enabled && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4"
        >
          {notice && (
            <div className="pointer-events-auto w-full max-w-md rounded-xl bg-overlay shadow-pop">
              <div className="alert alert-danger items-center py-3 pr-2 [&>svg]:mt-0">
                <CircleAlert />
                <p className="min-w-0 flex-1">{notice}</p>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss"
                  className="btn btn-ghost btn-sm btn-icon"
                >
                  <X />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </CustomerSessionContext.Provider>
  );
}
