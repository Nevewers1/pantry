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
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-brand" : "text-muted"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
