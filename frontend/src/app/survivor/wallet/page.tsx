import { AccountGate } from "@/components/onboarding/account-gate";
import { WalletView } from "@/components/wallet/wallet-view";

export default function WalletPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">My wallet</h1>
        <p className="text-sm text-muted-foreground">Support sent to you, on your terms.</p>
      </div>

      <AccountGate feature="the wallet">
        <WalletView withdrawHref="/survivor/wallet/withdraw" />
      </AccountGate>
    </div>
  );
}
