import type { NostrEvent } from 'nostr-tools/pure'

export type SignedEvent = NostrEvent

export type Health = { status: string }
export type WhoAmI = { pubkey: string }

export type OrganizationStatus = 'pending' | 'approved' | 'suspended'

export type OrganizationApplication = {
  name: string
  domain: string
  directory_visibility: 'public'
}

export type Organization = OrganizationApplication & {
  id: string
  nostr_pubkey: string
  nip05: string
  status: OrganizationStatus
  nip05_verified_at: string | null
}

export type CounselorProfile = {
  name: string
  about: string | null
  specialties: string[]
  languages: string[]
  response_time: string | null
}

export type Counselor = {
  pubkey: string
  status: 'verified' | 'expired' | 'removed'
  verified_until: string | null
  profile: CounselorProfile | null
  profile_event: SignedEvent | null
}

export type CounselorDirectory = {
  organization: Organization
  roster: SignedEvent | null
  roster_key_authorization: SignedEvent | null
  roster_key_revocation: SignedEvent | null
  counsellors: Counselor[]
}

export type OperationalKey = {
  pubkey: string
  scopes: string[]
  valid_from: string
  expires_at: string
  revoked_at: string | null
  authorization_event: SignedEvent
  revocation_event: SignedEvent | null
}

export type AuthorizationChallenge = {
  challenge: string
  scope: string
  expires_at: string
}

export type SupportGroup = { id: string; org_id: string; active: boolean }
export type MembershipInput = {
  role?: 'member' | 'moderator'
  expires_at?: string | null
}
export type Membership = {
  group_id: string
  role: string
  active: boolean
  expires_at: string | null
}

export type DisbursementInput = {
  amount_sat: number
  amount_kes: number
  rate_source: string
  reason_code: 'transport' | 'pharmacy' | 'shelter' | 'food' | 'other'
}

export type Disbursement = DisbursementInput & {
  id: string
  org_id: string
  state: string
  approval_count: number
  approvals_required: number
  ready: boolean
  created_at: string
}

