import { use } from "react";
import { ReportFlow } from "@/components/messaging/report-flow";

export default function ReportConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  return <ReportFlow conversationHref={`/counselor/messages/${conversationId}`} />;
}
