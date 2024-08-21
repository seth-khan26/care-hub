"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "", icon: "🏠" },
  { label: "Appointments", href: "/appointments", icon: "📅" },
  { label: "Patients", href: "/patients", icon: "👥" },
  { label: "Providers", href: "/providers", icon: "🩺" },
  { label: "Encounters", href: "/encounters", icon: "📋" },
  { label: "Documents", href: "/documents", icon: "📁" },
  { label: "Staff", href: "/settings/staff", icon: "👤" },
  { label: "Audit Log", href: "/audit", icon: "🔍" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

interface SidebarProps {
  orgSlug: string;
  orgName: string;
  userEmail: string;
}

export function Sidebar({ orgSlug, orgName, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const base = `/org/${orgSlug}`;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center border-b border-gray-200 px-4">
        <div>
          <p className="text-sm font-semibold text-blue-600">CareHub</p>
          <p className="text-xs text-gray-500 truncate max-w-[180px]">{orgName}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const href = `${base}${item.href}`;
            const isActive =
              item.href === ""
                ? pathname === base
                : pathname.startsWith(href);
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-gray-200 p-4">
        <p className="text-xs text-gray-500 truncate">{userEmail}</p>
        <form action="/api/auth/logout" method="POST" className="mt-2">
          <button
            type="submit"
            className="text-xs text-red-600 hover:text-red-800"
            onClick={async (e) => {
              e.preventDefault();
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
