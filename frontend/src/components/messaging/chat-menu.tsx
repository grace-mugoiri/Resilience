"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, ShieldAlert, Trash2, UserX } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { clearConversationLocally } from "@/lib/hooks/use-message-thread";

export function ChatMenu({
  conversationId,
  reportHref,
  extraAction,
}: {
  conversationId: string;
  reportHref: string;
  extraAction?: { label: string; icon: typeof UserX; onSelect: () => void };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Conversation options"
        aria-expanded={open}
        className="rounded-full p-2 text-muted-foreground hover:bg-surface-muted"
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <button
              onClick={() => {
                setOpen(false);
                router.push(reportHref);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-surface-muted"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Report
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setConfirmBlock(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-surface-muted"
            >
              <UserX className="h-4 w-4" aria-hidden="true" /> Block
            </button>
            {extraAction && (
              <button
                onClick={() => {
                  setOpen(false);
                  extraAction.onSelect();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-surface-muted"
              >
                <extraAction.icon className="h-4 w-4" aria-hidden="true" /> {extraAction.label}
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                setConfirmClear(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger hover:bg-danger-tint"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear this conversation from my phone
            </button>
          </div>
        </>
      )}

      <Modal open={confirmBlock} onClose={() => setConfirmBlock(false)} title={blocked ? "Blocked" : "Block this person?"}>
        {blocked ? (
          <p className="text-sm text-muted-foreground">They can no longer message you.</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              They won&apos;t be notified, and won&apos;t be able to send you new messages.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="danger" onClick={() => setBlocked(true)}>
                Block
              </Button>
              <Button variant="ghost" onClick={() => setConfirmBlock(false)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear this conversation?">
        <p className="mb-4 text-sm text-muted-foreground">
          This removes the conversation from this device only. It won&apos;t delete it for the other person.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            onClick={() => {
              clearConversationLocally(conversationId);
              setConfirmClear(false);
              window.location.reload();
            }}
          >
            Clear from this device
          </Button>
          <Button variant="ghost" onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
