// Photos and documents in messages (supabase/migrations/0043_message_attachments.sql).
// Client-safe: the limits and labels shared by the chat box, the actions
// that sign uploads and send, and /api/messages/attachment.

export const ATTACHMENT_BUCKET = "message-attachments";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
];
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

export type AttachmentKind = "photo" | "document" | "license" | "insurance";

export interface MessageAttachment {
  path: string; // "<conversation id>/<random>/<file name>" in ATTACHMENT_BUCKET
  name: string;
  type: string;
  size: number;
  kind: AttachmentKind;
  // When the other person first opened it: it disappears VIEW_WINDOW_MS
  // later (or UNOPENED_TTL_MS after sending if they never do).
  openedAt?: string | null;
  // Set once the file has been deleted from storage.
  deletedAt?: string | null;
}

// Files disappear for privacy: 15 minutes after the recipient first opens
// them, or a week after sending if they never do (/api/cron/expire-attachments
// deletes them; /api/messages/attachment stops serving them on time).
export const VIEW_WINDOW_MS = 15 * 60 * 1000;
export const UNOPENED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// When this attachment disappears, as epoch ms.
export function attachmentExpiresAt(a: Pick<MessageAttachment, "openedAt">, sentAt: string): number {
  return a.openedAt ? Date.parse(a.openedAt) + VIEW_WINDOW_MS : Date.parse(sentAt) + UNOPENED_TTL_MS;
}

export function isAttachmentGone(a: Pick<MessageAttachment, "openedAt" | "deletedAt">, sentAt: string, now = Date.now()): boolean {
  return Boolean(a.deletedAt) || now >= attachmentExpiresAt(a, sentAt);
}

// The documents a shopper can share from their account.
export const SHAREABLE_DOCS = {
  license: { label: "Driver's license", file: "drivers-license" },
  insurance: { label: "Insurance card", file: "insurance-card" },
} as const;
export type ShareableDoc = keyof typeof SHAREABLE_DOCS;

export function attachmentLabel(a: Pick<MessageAttachment, "kind" | "name">): string {
  if (a.kind === "license") return SHAREABLE_DOCS.license.label;
  if (a.kind === "insurance") return SHAREABLE_DOCS.insurance.label;
  return a.name;
}

export const isImageType = (type: string) => type.startsWith("image/");
// Browsers other than Safari can't show HEIC; those are offered as a download.
export const isDisplayableImage = (type: string) => isImageType(type) && !/hei[cf]/.test(type);

// "a photo", "2 photos and a PDF", "their driver's license" — for email and
// text notices of a message that's only attachments.
export function describeAttachments(list: Pick<MessageAttachment, "kind" | "type">[]): string {
  const docs = list.filter((a) => a.kind === "license" || a.kind === "insurance").map((a) =>
    a.kind === "license" ? "driver's license" : "insurance card"
  );
  const photos = list.filter((a) => a.kind === "photo").length;
  const files = list.filter((a) => a.kind === "document").length;
  const parts = [
    ...docs,
    ...(photos ? [photos === 1 ? "a photo" : `${photos} photos`] : []),
    ...(files ? [files === 1 ? "a file" : `${files} files`] : []),
  ];
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// A file name safe for a storage path.
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || "file").slice(-80);
}

// Checks attachments a client sent: right shape, in this conversation's folder.
export function cleanAttachments(raw: unknown, conversationId: string): MessageAttachment[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS) return null;
  const out: MessageAttachment[] = [];
  for (const item of raw) {
    const a = (item ?? {}) as Record<string, unknown>;
    const path = typeof a.path === "string" ? a.path : "";
    const parts = path.split("/");
    if (parts.length !== 3 || parts[0] !== conversationId || !parts[1] || !parts[2] || path.includes("..")) return null;
    const type = typeof a.type === "string" ? a.type : "";
    if (!ATTACHMENT_TYPES.includes(type)) return null;
    const size = typeof a.size === "number" && a.size > 0 && a.size <= MAX_ATTACHMENT_BYTES ? a.size : null;
    if (size == null) return null;
    const name = typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 120) : parts[2];
    out.push({ path, name, type, size, kind: isImageType(type) ? "photo" : "document" });
  }
  return out;
}
