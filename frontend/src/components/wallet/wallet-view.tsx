"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Wallet as WalletIcon, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { MockQr } from "@/components/wallet/mock-qr";
import { TransactionItem } from "@/components/wallet/transaction-item";
import { getWallet, connectWallet, listTransactions, mockZap } from "@/lib/api/wallet";
import { ApiError } from "@/lib/api/client";
import { formatSats } from "@/lib/utils";
import type { Transaction, Wallet } from "@/lib/types";

function generateMockAddress() {
  const chars = "023456789acdefghjklmnpqrstuvwxyz";
  let s = "bc1q";
  for (let i = 0; i < 38; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function WalletView({ withdrawHref }: { withdrawHref: string }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([getWallet(), listTransactions()])
      .then(([w, tx]) => {
        setWallet(w);
        setTransactions(tx);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your wallet"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConnect() {
    setBusy(true);
    try {
      await connectWallet(generateMockAddress());
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateZap() {
    setBusy(true);
    try {
      await mockZap(2500, "Sending you strength", "A supporter");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState description={error} />;
  if (!wallet) return <LoadingState />;

  if (!wallet.connected) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <WalletIcon className="h-10 w-10 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">Connect a wallet to receive support</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Money sent to you stays here until you choose to withdraw — choose a time that&apos;s safe for you.
          </p>
        </div>
        <Button disabled={busy} onClick={handleConnect}>
          Connect wallet
        </Button>
      </Card>
    );
  }

  return (
    <>
      <div className="rounded-full bg-warning-tint px-3 py-1.5 text-center text-xs font-medium text-warning">
        TEST MODE — this wallet uses mock funds only, no real money moves
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Available balance</p>
          <button onClick={() => setRevealed((r) => !r)} className="text-muted-foreground hover:text-foreground" aria-label={revealed ? "Hide balance" : "Show balance"}>
            {revealed ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <p className="mt-1 text-3xl font-bold text-foreground">{revealed ? formatSats(wallet.balance_sats) : "•••• sats"}</p>
        <div className="mt-4 flex gap-2">
          <Link href={withdrawHref} className="flex-1">
            <Button variant="secondary" className="w-full">
              Withdraw
            </Button>
          </Link>
          <Button variant="ghost" className="flex-1" disabled={busy} onClick={handleSimulateZap}>
            <Zap className="h-4 w-4" aria-hidden="true" /> Simulate support
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">Receive</p>
        <MockQr value={wallet.public_address} />
        <p className="break-all font-mono text-xs text-muted-foreground">{wallet.public_address}</p>
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Recent payments</p>
        {transactions.length === 0 ? (
          <EmptyState icon={WalletIcon} title="No payments yet" />
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {transactions.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
