import Link from "next/link";
import { MessageSquare } from "lucide-react";

export interface ConversationListItem {
  id: string;
  href: string;
  title: string; // the other side's name (or "Shopper ↔ Seller" for admin)
  dealLabel: string;
  preview: string;
  lastMessageAt: string;
  unread: boolean;
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// An inbox: newest conversation first, unread ones marked.
export default function ConversationList({
  items,
  emptyMessage,
}: {
  items: ConversationListItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="panel flex flex-col items-center py-12 text-center">
        <MessageSquare className="size-8 text-fg-faint" aria-hidden="true" />
        <p className="mt-3 max-w-sm text-sm text-fg-muted">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={c.href} className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-hover sm:px-5">
            <span
              aria-hidden="true"
              className={`mt-2 size-2 shrink-0 rounded-full ${c.unread ? "bg-accent" : "bg-transparent"}`}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-sm ${c.unread ? "font-semibold text-fg" : "font-medium text-fg-secondary"}`}>
                  {c.title}
                  {c.unread && <span className="sr-only"> (unread)</span>}
                </span>
                <span className="shrink-0 text-xs text-fg-muted">{when(c.lastMessageAt)}</span>
              </span>
              {c.dealLabel && <span className="mt-0.5 block truncate text-xs text-fg-muted">{c.dealLabel}</span>}
              <span className={`mt-1 block truncate text-sm ${c.unread ? "text-fg" : "text-fg-muted"}`}>{c.preview}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
