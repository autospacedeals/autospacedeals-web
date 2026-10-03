"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { UnreadBadge, useUnreadMessages } from "@/components/messages/UnreadMessages";

// The broker portal header's Messages link, with the live unread count.
export default function BrokerMessagesLink() {
  const unread = useUnreadMessages("broker");
  return (
    <Link href="/broker/dashboard/messages" className="btn btn-ghost btn-sm">
      <MessageSquare /> Messages <UnreadBadge count={unread} />
    </Link>
  );
}
