// Types mirror the FastAPI response/request schemas in backend/app/schemas/.
// Keep these in sync by hand for the prototype — see backend/API.md.

export type IdentityRole = "survivor" | "counselor";

export interface Identity {
  id: string;
  pseudonym: string;
  role: IdentityRole;
  npub: string;
  avatar_seed: string;
  created_at: string;
}

export interface IdentityCreateResponse {
  identity: Identity;
  recovery_phrase: string;
  token: string;
}

export interface IdentityAuthResponse {
  identity: Identity;
  token: string;
}

export type VerificationStatus = "verified" | "pending" | "expired" | "revoked";

export interface CounselorProfile {
  id: string;
  identity_id: string;
  display_name: string;
  bio: string;
  specialties: string[];
  languages: string[];
  attesting_organization: string;
  verification_status: VerificationStatus;
  verification_updated_at: string;
  verification_expires_at: string | null;
  is_available: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  topic: string;
  member_count: number;
  facilitator_name: string;
  requires_approval: boolean;
  rules: string[];
  is_member: boolean;
  is_pending: boolean;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_identity_id: string;
  sender_pseudonym: string;
  body: string;
  client_message_id: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  counterpart_identity_id: string;
  counterpart_pseudonym: string;
  last_message_preview: string;
  last_message_at: string | null;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_identity_id: string;
  body: string;
  client_message_id: string;
  created_at: string;
}

export type ResourceCategory = "legal" | "medical" | "shelter" | "educational";

export interface Resource {
  id: string;
  title: string;
  category: ResourceCategory;
  summary: string;
  region: string;
  contact: string;
  is_demo_data: boolean;
}

export interface ActiveShare {
  share_id: string;
  counselor_identity_id: string;
  pseudonym: string;
}

export interface HealthRecord {
  id: string;
  record_type: string;
  title: string;
  body: string;
  created_at: string;
  shared_with: ActiveShare[];
}

export interface HealthShare {
  id: string;
  record_id: string;
  shared_with_identity_id: string;
  granted_at: string;
  revoked_at: string | null;
}

export interface Wallet {
  connected: boolean;
  public_address: string;
  balance_sats: number;
  connected_at: string | null;
}

export type TransactionDirection = "incoming" | "outgoing";
export type TransactionStatus = "pending" | "success" | "failed";

export interface Transaction {
  id: string;
  direction: TransactionDirection;
  amount_sats: number;
  status: TransactionStatus;
  memo: string;
  counterparty_label: string;
  created_at: string;
}

export interface CircleMember {
  id: string;
  member_identity_id: string;
  pseudonym: string;
  label: string;
  added_at: string;
}
