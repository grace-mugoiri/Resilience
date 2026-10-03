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
  available: boolean
  working_hours: string | null
  availability_event: SignedEvent | null
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

export type OrganizationAccess = {
  organization: Organization
  actor: 'root' | 'operational'
  operational_key: OperationalKey | null
}

export type OrganizationDashboard = {
  organization: Organization
  active_invites: number
  enrollments: Record<CounselorEnrollmentStatus, number>
  counsellors: Record<'verified' | 'expired' | 'removed', number>
}

export type AuthorizationChallenge = {
  challenge: string
  scope: string
  expires_at: string
}

export type CounselorEnrollmentStatus =
  | 'draft'
  | 'under_review'
  | 'more_information'
  | 'approved'
  | 'rejected'

export type EncryptedCredential = {
  v: 1
  algorithm: 'aes-256-gcm+nip44-v2'
  recipient_pubkey: string
  wrapped_key: string
  iv: string
  ciphertext: string
  media_type: 'application/pdf' | 'image/jpeg' | 'image/png'
}

export type CounselorEnrollment = {
  id: string
  organization_id: string
  organization_name: string
  counsellor_pubkey: string
  status: CounselorEnrollmentStatus
  directory_status: 'verified' | 'expired' | 'removed' | null
  credential_recipient_pubkey: string
  profile: CounselorProfile
  profile_event: SignedEvent
  encrypted_credentials: EncryptedCredential[] | null
  review_message: string | null
  submitted_at: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type CounselorInviteInput = {
  credential_recipient_pubkey: string
  expires_in_hours?: number
}

export type CounselorInvite = {
  id: string
  code: string
  organization_id: string
  credential_recipient_pubkey: string
  expires_at: string
}

export type CounselorInviteRecord = {
  id: string
  organization_id: string
  credential_recipient_pubkey: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export type CounselorEnrollmentFilter = CounselorEnrollmentStatus | undefined

export type SupportGroup = {
  id: string
  org_id: string
  active: boolean
  slug: string | null
  title: string | null
  description: string | null
  access: 'open' | 'request'
  leader_name: string | null
  organization_name: string | null
}
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

export type GroupJoin = {
  group_id: string
  status: 'pending' | 'approved' | 'rejected'
  role?: string | null
}

export type CircleInvite = { circle_id: string; code: string; expires_at: string }
export type CircleClaim = { circle_id: string; inviter_pubkey: string }
export type CircleStatus = { circle_id: string | null; member_count: number; owner: boolean }
export type SafetyReport = { id: string; status: string; created_at: string }
export type CounselorAvailability = {
  available: boolean
  working_hours: string | null
  updated_at: string
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
