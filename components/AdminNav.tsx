"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/admins", label: "Admins" },
];

// Tabs across the top of every admin page.
export default function AdminNav({ email }: { email: string }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="border-b border-line bg-surface">
      <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
        <nav aria-label="Admin" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const current = l.exact ? pathname === l.href : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={current ? "page" : undefined}
                className="btn btn-ghost btn-sm shrink-0 aria-[current=page]:bg-hover aria-[current=page]:text-fg"
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <p className="text-xs text-fg-muted">
          Admin · <span className="text-fg-secondary">{email}</span>
        </p>
      </div>
    </div>
  );
}
