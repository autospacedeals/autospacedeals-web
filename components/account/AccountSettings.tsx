"use client";

// "Account" on the shopper and broker dashboards: change password, change
// email, delete account (app/account/actions.ts). Each opens in place.
import { useActionState, useState } from "react";
import { KeyRound, Mail, Trash2 } from "lucide-react";
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  type AccountFormState,
} from "@/app/account/actions";
import { submitKeepingValues } from "@/lib/keep-form-values";

const initial: AccountFormState = { error: null };
type Panel = "password" | "email" | "delete" | null;

export default function AccountSettings({
  email,
  pendingEmail,
  hasPassword,
  role,
  liveListings = 0,
}: {
  email: string;
  pendingEmail: string | null;
  hasPassword: boolean;
  role: "customer" | "broker";
  liveListings?: number;
}) {
  const [open, setOpen] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setOpen((cur) => (cur === p ? null : p));

  return (
    <div className="divide-y divide-line">
      <Row
        icon={<KeyRound size={16} />}
        title="Password"
        detail={hasPassword ? "Change the password you sign in with." : "You sign in with Google. Add a password to also sign in with your email."}
        button={hasPassword ? "Change" : "Add password"}
        active={open === "password"}
        onClick={() => toggle("password")}
      >
        <PasswordForm hasPassword={hasPassword} />
      </Row>
      <Row
        icon={<Mail size={16} />}
        title="Email"
        detail={
          <>
            <span className="wrap-anywhere text-fg-secondary">{email}</span>
            {pendingEmail && (
              <span className="mt-0.5 block text-xs text-warning">
                Changing to {pendingEmail} — open the confirmation links sent to both addresses to finish.
              </span>
            )}
          </>
        }
        button="Change"
        active={open === "email"}
        onClick={() => toggle("email")}
      >
        <EmailForm />
      </Row>
      <Row
        icon={<Trash2 size={16} />}
        title="Delete account"
        detail={
          role === "broker"
            ? "Permanently delete your account, your listings and your messages."
            : "Permanently delete your account, saved cars, searches and messages."
        }
        button="Delete"
        danger
        active={open === "delete"}
        onClick={() => toggle("delete")}
      >
        <DeleteForm role={role} liveListings={liveListings} />
      </Row>
    </div>
  );
}

function Row({
  icon,
  title,
  detail,
  button,
  danger,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail: React.ReactNode;
  button: string;
  danger?: boolean;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="flex items-center gap-2 font-medium text-fg">
            <span className="text-fg-faint">{icon}</span>
            {title}
          </p>
          <div className="mt-1 text-fg-muted">{detail}</div>
        </div>
        <button
          type="button"
          onClick={onClick}
          aria-expanded={active}
          className={`btn btn-sm shrink-0 ${danger && !active ? "btn-ghost text-danger" : "btn-secondary"}`}
        >
          {active ? "Cancel" : button}
        </button>
      </div>
      {active && <div className="mt-4">{children}</div>}
    </div>
  );
}

function Status({ state }: { state: AccountFormState }) {
  if (state.error)
    return (
      <p role="alert" className="alert alert-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="alert alert-success">
        {state.message}
      </p>
    );
  return null;
}

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="max-w-sm space-y-4">
      {hasPassword && (
        <div>
          <label htmlFor="acct-current" className="field-label">
            Current password
          </label>
          <input id="acct-current" name="currentPassword" type="password" required autoComplete="current-password" className="input" />
        </div>
      )}
      <div>
        <label htmlFor="acct-new" className="field-label">
          New password
        </label>
        <input id="acct-new" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
        <p className="field-hint">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="acct-confirm" className="field-label">
          Confirm new password
        </label>
        <input id="acct-confirm" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="input" />
      </div>
      <Status state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "Saving..." : hasPassword ? "Change password" : "Add password"}
      </button>
    </form>
  );
}

function EmailForm() {
  const [state, action, pending] = useActionState(changeEmailAction, initial);
  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="acct-email" className="field-label">
          New email
        </label>
        <input id="acct-email" name="email" type="email" required autoComplete="email" className="input" />
        <p className="field-hint">We&apos;ll email a confirmation link to both your current and new address.</p>
      </div>
      <Status state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "Sending..." : "Send confirmation link"}
      </button>
    </form>
  );
}

function DeleteForm({ role, liveListings }: { role: "customer" | "broker"; liveListings: number }) {
  const [state, action, pending] = useActionState(deleteAccountAction, initial);
  const [typed, setTyped] = useState("");
  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="max-w-md space-y-4">
      <div className="alert alert-danger text-sm">
        This can&apos;t be undone.{" "}
        {role === "broker"
          ? `Your ${liveListings > 0 ? `${liveListings} live listing${liveListings === 1 ? "" : "s"}` : "listings"}, connected sheets and conversations with shoppers will be deleted.`
          : "Your saved cars, saved searches, uploaded documents and conversations with sellers will be deleted."}
      </div>
      <div>
        <label htmlFor="acct-delete" className="field-label">
          Type DELETE to confirm
        </label>
        <input
          id="acct-delete"
          name="confirm"
          required
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="input"
        />
      </div>
      <Status state={state} />
      <button type="submit" disabled={pending || typed.trim().toUpperCase() !== "DELETE"} className="btn btn-danger btn-sm">
        {pending ? "Deleting..." : "Delete my account"}
      </button>
    </form>
  );
}
