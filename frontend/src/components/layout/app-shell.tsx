import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { QuickExitButton } from "@/components/safety/quick-exit-button";
import { StillThereGuard } from "@/components/safety/still-there-guard";
import { OfflineBanner } from "@/components/messaging/offline-banner";
import type { NavItem } from "./nav-items";

export function AppShell({
  children,
  navItems,
  title,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  title: string;
}) {
  return (
    <div className="flex min-h-screen">
      <StillThereGuard />
      <Sidebar items={navItems} title={title} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:px-6">
          <p className="text-base font-semibold text-primary md:hidden">{title}</p>
          <div className="hidden md:block" />
          <QuickExitButton />
        </header>
        <OfflineBanner />
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <BottomNav items={navItems} />
    </div>
  );
}
