"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { SettingsSubpage } from "@/components/layout/settings-subpage";
import { PinPad } from "@/components/safety/pin-pad";
import { changePin } from "@/lib/api/identity";
import { ApiError } from "@/lib/api/client";

type Step = "current" | "new" | "confirm" | "done";

export default function ChangePinPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");

  async function finish(finalNewPin: string) {
    try {
      await changePin(currentPin, finalNewPin);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Current PIN is incorrect." : "Something went wrong.");
      setStep("current");
      setCurrentPin("");
      setNewPin("");
      setValue("");
    }
  }

  function handleChange(v: string) {
    setValue(v);
    if (v.length !== 4) return;
    if (step === "current") {
      setCurrentPin(v);
      setStep("new");
      setValue("");
    } else if (step === "new") {
      setNewPin(v);
      setStep("confirm");
      setValue("");
    } else if (step === "confirm") {
      if (v === newPin) finish(v);
      else {
        setError("PINs didn't match — try again.");
        setStep("new");
        setNewPin("");
        setValue("");
      }
    }
  }

  const labels: Record<Step, string> = {
    current: "Enter your current PIN",
    new: "Choose a new PIN",
    confirm: "Confirm your new PIN",
    done: "",
  };

  return (
    <SettingsSubpage title="Change PIN">
      {step === "done" ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <p className="font-semibold text-foreground">Your PIN has been updated</p>
          <button onClick={() => router.push("/survivor/settings")} className="text-sm font-medium text-primary hover:underline">
            Back to Settings
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <p className="text-sm font-medium text-foreground">{labels[step]}</p>
          <PinPad value={value} onChange={handleChange} />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </SettingsSubpage>
  );
}
