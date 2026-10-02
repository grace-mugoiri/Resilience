import { WalletView } from "@/components/wallet/wallet-view";

export default function CounselorWalletPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">My wallet</h1>
        <p className="text-sm text-muted-foreground">Support sent to you by survivors and the community.</p>
      </div>
      <WalletView withdrawHref="/counselor/wallet/withdraw" />
    </div>
  );
}
