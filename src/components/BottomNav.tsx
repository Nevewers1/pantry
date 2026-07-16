"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookIcon,
  BoxIcon,
  CalendarIcon,
  CartIcon,
  HomeIcon,
} from "@/components/icons";

const TABS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/pantry", label: "Pantry", Icon: BoxIcon },
  { href: "/recipes", label: "Recipes", Icon: BookIcon },
  { href: "/plan", label: "Plan", Icon: CalendarIcon },
  { href: "/shopping", label: "Shop", Icon: CartIcon },
];

const HIDE_ON = ["/login", "/setup", "/auth"];

export function BottomNav() {
  const pathname = usePathname() || "/";
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="pointer-events-auto mx-4 flex w-full max-w-md items-center justify-around rounded-full border border-border bg-surface/95 px-2 py-1.5 shadow-nav backdrop-blur-md">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center"
            >
              <span
                className={`flex h-10 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors ${
                  active ? "bg-brand text-white" : "text-faint hover:text-muted"
                }`}
              >
                <Icon className="h-[20px] w-[20px]" />
                {active && <span>{label}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
