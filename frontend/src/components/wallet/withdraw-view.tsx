"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { getWallet, mockWithdraw } from "@/lib/api/wallet";
import { ApiError } from "@/lib/api/client";
import { formatSats } from "@/lib/utils";

export function WithdrawView({ walletHref }: { walletHref: string }) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getWallet().then((w) => setBalance(w.balance_sats));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await mockWithdraw(Number(amount), phone.trim());
      router.push(walletHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start this withdrawal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div>
        <h1 className="text-lg font-bold text-foreground">Schedule a withdrawal</h1>
        {balance !== null && <p className="mt-1 text-sm text-muted-foreground">Available: {formatSats(balance)}</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Amount to withdraw (sats)" htmlFor="amount">
          <Input
            id="amount"
            type="number"
            min={1}
            max={balance ?? undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="M-Pesa phone number" htmlFor="phone" hint="Must be registered with M-Pesa.">
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" required />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting}>
          Review
        </Button>
      </form>
    </div>
  );
}
