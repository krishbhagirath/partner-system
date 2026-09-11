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

    function handlePointerOutside(event: Event) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    // touchstart as well as mousedown: iOS Safari does not reliably fire
    // mousedown for taps on non-interactive elements, so a mousedown-only
    // listener leaves the panel stuck open on iPhones.
    document.addEventListener("mousedown", handlePointerOutside);
    document.addEventListener("touchstart", handlePointerOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerOutside);
      document.removeEventListener("touchstart", handlePointerOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label="Notifications"
        className="relative grid size-9 place-items-center rounded-md border border-rule bg-surface text-muted transition-colors hover:border-gold hover:text-ink"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <svg
          aria-hidden
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          viewBox="0 0 24 24"
        >
          <path
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {hasUnread ? (
          <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand" />
        ) : null}
      </button>

      {open ? (
        <>
          <div aria-hidden className="fixed inset-0 z-20 bg-ink/25 sm:hidden" />

          {/*
            Below sm the panel is `fixed` to the viewport rather than anchored to
            the bell. Right-anchoring a fixed-width popover to a button that is not
            itself at the screen edge pushed the panel off the left of the screen
            (measured: x = -77px at 390px wide, -107px at 360px), and max-width
            cannot fix that because it caps width without moving the box. The
            sticky header sets no transform, so `fixed` resolves against the
            viewport and the sheet always fits. sm+ keeps the original popover.
          */}
          <div className="fixed inset-x-3 top-[4.5rem] z-30 overflow-hidden rounded-xl border border-rule bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80">
            <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3 text-sm font-bold text-ink">
              Notifications
              <button
                aria-label="Close notifications"
                className="-my-1 -mr-1 grid size-7 place-items-center rounded-md text-lg leading-none text-muted transition-colors hover:text-ink sm:hidden"
                onClick={() => setOpen(false)}
                type="button"
              >
                &times;
              </button>
            </div>
            {/*
              Height is derived from what is left below the panel's own top edge
              and its header rather than a fixed max-h, so the list still fits on a
              short screen such as a phone in landscape (a flat sm:max-h-80 there
              ran 24px past the bottom of a 400px-tall viewport). dvh tracks the
              collapsing mobile browser toolbar; vh does not.
            */}
            <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto overscroll-contain sm:max-h-[min(20rem,calc(100dvh-7rem))]">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  You&apos;re all caught up.
                </p>
              ) : (
                notifications.map((notification) => (
                  <div
                    className="flex gap-3 border-b border-rule px-4 py-3 last:border-b-0"
                    key={notification.id}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        notification.unread ? "bg-brand" : "bg-rule"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm leading-5 text-ink">{notification.message}</p>
                      <p className="mt-1 text-xs font-semibold text-muted">
                        {notification.timeLabel}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
