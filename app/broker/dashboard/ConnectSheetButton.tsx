"use client";

// "Connect with Google" for a private Google Sheet: the broker signs in with
// Google, confirms their sheet in Google's picker, and we add Drive's reader
// account (the service account in lib/google-service-account.ts) to the
// sheet as a viewer, with no notification email. After that the sheet reads
// and syncs like any shared one.
//
// Runs entirely in the browser with Google's own scripts: the access token
// covers only the file the broker picks (the drive.file scope), is used for
// that one share, and is never sent to our server or stored.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// Public values — they ship to every browser by design. The client is
// "Drive sheet connect" in the Google Cloud project behind the sheet reader;
// the key only works for the Picker API on idriveus.com and localhost.
const CLIENT_ID = "580987260363-g2dcf35obdtshv24qmnmpe2gt77itm6a.apps.googleusercontent.com";
const PICKER_KEY = "AIzaSyC2edRLuKzU-cer8sERJ_Ti65ku8pmz-TY";
const APP_ID = "580987260363";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

/* Minimal typings for the bits of Google's scripts used here. */
interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
}
interface PickerDoc {
  id: string;
}
interface PickerResult {
  action: string;
  docs?: PickerDoc[];
}
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string }) => void;
      }) => TokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: string) => DocsView;
    ViewId: { SPREADSHEETS: string };
    Action: { PICKED: string; CANCEL: string };
    DocsViewMode: { LIST: string };
  };
}
interface DocsView {
  setFileIds: (ids: string) => DocsView;
  setMode: (mode: string) => DocsView;
}
interface PickerBuilder {
  addView: (v: DocsView) => PickerBuilder;
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  setTitle: (t: string) => PickerBuilder;
  setCallback: (cb: (r: PickerResult) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}
declare global {
  interface Window {
    google?: GoogleGlobal;
    gapi?: { load: (lib: string, cb: () => void) => void };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}

// Loaded ahead of the click: browsers only allow Google's sign-in popup when
// it opens straight from the click itself.
let ready: Promise<void> | null = null;
function loadGoogle(): Promise<void> {
  ready ??= Promise.all([
    loadScript("https://accounts.google.com/gsi/client"),
    loadScript("https://apis.google.com/js/api.js").then(
      () => new Promise<void>((resolve) => window.gapi!.load("picker", resolve))
    ),
  ]).then(() => undefined);
  return ready;
}

export default function ConnectSheetButton({
  sheetId,
  readerEmail,
  onConnected,
}: {
  sheetId: string;
  readerEmail: string;
  onConnected: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGoogle()
      .then(() => setLoaded(true))
      .catch(() => setError("Couldn't load Google's sign-in. Check your connection and refresh the page."));
  }, []);

  async function share(token: string, fileId: string) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "user", emailAddress: readerEmail }),
      }
    );
    if (res.ok) {
      onConnected();
      return;
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    console.error("Sheet connect: share failed", res.status, body?.error?.message);
    setError(
      res.status === 403
        ? "Google says this account can't share that sheet — only its owner (or an editor allowed to share) can connect it. Sign in with that account and try again."
        : "Couldn't connect the sheet. Please try again."
    );
  }

  function connect() {
    const google = window.google;
    if (!google) return;
    setError(null);
    setBusy(true);
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) {
          setBusy(false);
          if (r.error !== "access_denied") setError("Google sign-in didn't finish. Please try again.");
          return;
        }
        const token = r.access_token;
        const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
          .setFileIds(sheetId)
          .setMode(google.picker.DocsViewMode.LIST);
        new google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(PICKER_KEY)
          .setAppId(APP_ID)
          .setTitle("Select your inventory sheet")
          .setCallback((result) => {
            if (result.action === google.picker.Action.PICKED && result.docs?.[0]) {
              void share(token, result.docs[0].id).finally(() => setBusy(false));
            } else if (result.action === google.picker.Action.CANCEL) {
              setBusy(false);
            }
          })
          .build()
          .setVisible(true);
      },
      error_callback: () => setBusy(false),
    });
    client.requestAccessToken({ prompt: "" });
  }

  return (
    <div>
      <button type="button" onClick={connect} disabled={!loaded || busy} className="btn btn-primary">
        {busy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
        {busy ? "Connecting…" : "Connect with Google"}
      </button>
      {error && (
        <p role="alert" className="alert alert-danger mt-2">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
