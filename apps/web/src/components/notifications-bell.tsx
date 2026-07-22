"use client";

import { useEffect, useRef, useState } from "react";

export type NotificationView = {
  id: string;
  message: string;
  timeLabel: string;
  unread: boolean;
};

export function NotificationsBell({ notifications }: { notifications: NotificationView[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasUnread = notifications.some((notification) => notification.unread);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label="Notifications"
        className="relative grid size-9 place-items-center rounded-md border border-zinc-200 bg-white text-base transition-colors hover:border-gold"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        🔔
        {hasUnread ? (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand"
          />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-20 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-100 px-4 py-3 text-sm font-bold text-zinc-950">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">
                You&apos;re all caught up.
              </p>
            ) : (
              notifications.map((notification) => (
                <div
                  className="flex gap-3 border-b border-zinc-50 px-4 py-3 last:border-b-0"
                  key={notification.id}
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      notification.unread ? "bg-brand" : "bg-zinc-200"
                    }`}
                  />
                  <div>
                    <p className="text-sm leading-5 text-zinc-900">{notification.message}</p>
                    <p className="mt-1 text-xs font-semibold text-zinc-400">
                      {notification.timeLabel}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
