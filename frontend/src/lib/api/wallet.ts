import { apiFetch } from "./client";
import type { Transaction, Wallet } from "@/lib/types";

export function getWallet() {
  return apiFetch<Wallet>("/api/wallet");
}

export function connectWallet(publicAddress: string) {
  return apiFetch<Wallet>("/api/wallet/connect", {
    method: "POST",
    body: JSON.stringify({ public_address: publicAddress }),
  });
}

export function disconnectWallet() {
  return apiFetch<Wallet>("/api/wallet/disconnect", { method: "POST" });
}

export function listTransactions() {
  return apiFetch<Transaction[]>("/api/wallet/transactions");
}

export function mockZap(amountSats: number, memo: string, fromLabel: string) {
  return apiFetch<Transaction>("/api/wallet/zap/mock", {
    method: "POST",
    body: JSON.stringify({ amount_sats: amountSats, memo, from_label: fromLabel }),
  });
}

export function mockWithdraw(amountSats: number, destination: string) {
  return apiFetch<Transaction>("/api/wallet/withdraw/mock", {
    method: "POST",
    body: JSON.stringify({ amount_sats: amountSats, destination }),
  });
}
