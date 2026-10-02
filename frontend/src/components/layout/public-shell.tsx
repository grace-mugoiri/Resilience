import { QuickExitButton } from "@/components/safety/quick-exit-button";

/** Wraps every pre-authentication screen (safety check onward). The Figma
 * design notes require Quick Exit to be reachable from the very first
 * screen, not just once a survivor is signed in. */
export function PublicShell({ children, showExit = true }: { children: React.ReactNode; showExit?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {showExit && (
        <header className="flex justify-end px-4 py-3">
          <QuickExitButton />
        </header>
      )}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10">{children}</main>
    </div>
  );
}
