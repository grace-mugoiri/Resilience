import { SettingsSubpage } from "@/components/layout/settings-subpage";
import { Card } from "@/components/ui/card";

const SECTIONS = [
  {
    title: "What we collect",
    body: "Your nickname, a keypair-based identifier, and whatever you choose to write in messages, group posts, or your records. No name, email, phone number, or location is ever required.",
  },
  {
    title: "What we can't protect against",
    body: "If someone else has physical access to this device, or watches you type your PIN, they may be able to see what you see. Quick Exit and PIN locks reduce — but can't eliminate — that risk in a browser.",
  },
  {
    title: "Who can see what",
    body: "Counselors and group members only ever see your nickname and what you post. Health records are private by default and only visible to counselors you explicitly share them with.",
  },
];

export default function PrivacyPage() {
  return (
    <SettingsSubpage title="How your privacy works">
      <div className="flex flex-col gap-4">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <p className="font-semibold text-foreground">{s.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </Card>
        ))}
      </div>
    </SettingsSubpage>
  );
}
