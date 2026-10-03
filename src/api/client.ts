import type { NostrEvent } from 'nostr-tools/pure'
import { runtimeConfig } from '../config/runtime'
import { readClientConfiguration, type ClientConfiguration } from '../messaging/config'
import { NostrHttpSigner } from './nip98'
import type {
  AuthorizationChallenge,
  CircleClaim,
  CircleInvite,
  CircleRecipients,
  CircleStatus,
  Counselor,
  CounselorDirectory,
  CounselorEnrollment,
  CounselorEnrollmentFilter,
  CounselorInvite,
  CounselorInviteInput,
  CounselorInviteRecord,
  CounselorAvailability,
  Disbursement,
  DisbursementInput,
  EncryptedCredential,
  Health,
  Membership,
  MembershipInput,
  GroupJoin,
  RoomRecipients,
  OperationalKey,
  Organization,
  OrganizationAccess,
  OrganizationApplication,
  OrganizationDashboard,
  OrganizationStatus,
  SupportGroup,
  SupportGroupInput,
  SafetyReport,
  WhoAmI,
} from './types'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type Auth = 'none' | 'basic' | { scope: string }

type RequestOptions = {
  method?: Method
  body?: unknown
  auth?: Auth
  headers?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : `API request failed with HTTP ${status}`)
  }
}

export type ApiClientOptions = {
  apiBase?: string
  signer?: NostrHttpSigner
  fetcher?: typeof fetch
}

const enc = (value: string) => encodeURIComponent(value)

export class ResilienceApi {
  readonly apiBase: string
  private readonly signer?: NostrHttpSigner
  private readonly fetcher: typeof fetch

  constructor({
    apiBase = runtimeConfig.apiBase,
    signer,
    fetcher,
  }: ApiClientOptions = {}) {
    this.apiBase = apiBase.replace(/\/+$/, '')
    this.signer = signer
    // Browser-native fetch performs an internal receiver check in some engines. Storing the
    // unbound function as an object method makes `this.fetcher(...)` fail with
    // "Illegal invocation", while test doubles (ordinary functions) appear to work.
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis)
  }

  private requireSigner() {
    if (!this.signer) throw new Error('This API operation requires an unlocked Nostr identity')
    return this.signer
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET'
    const url = `${this.apiBase}${path}`
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    if (options.auth && options.auth !== 'none') {
      const signer = this.requireSigner()
      let challenge: string | undefined
      let scope: string | undefined
      if (typeof options.auth === 'object') {
        scope = options.auth.scope
        challenge = (await this.createChallenge(scope)).challenge
      }
      headers.Authorization = await signer.authorization({ url, method, body, scope, challenge })
    }

    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort()
    if (options.signal?.aborted) controller.abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, options.timeoutMs ?? 15_000)
    let response: Response
    try {
      response = await this.fetcher(url, {
        method,
        body,
        headers,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: options.auth && options.auth !== 'none' ? 'no-store' : 'default',
        signal: controller.signal,
      })
    } catch (error) {
      if (timedOut) throw new Error('The server took too long to respond. Check your connection and try again.', { cause: error })
      throw error
    } finally {
      globalThis.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
    }
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload
          ? (payload as { detail: unknown }).detail
          : payload
      throw new ApiError(response.status, detail)
    }
    return payload as T
  }

  health(signal?: AbortSignal) {
    return this.request<Health>('/healthz', { signal })
  }

  async clientConfiguration(platformPublicKey: string, signal?: AbortSignal) {
    const event = await this.request<NostrEvent>('/v1/config', { signal })
    return readClientConfiguration(event, platformPublicKey)
  }

  whoAmI() {
    return this.request<WhoAmI>('/v1/whoami', { auth: 'basic' })
  }

  createChallenge(scope: string) {
    return this.request<AuthorizationChallenge>('/v1/auth/challenges', {
      method: 'POST',
      body: { scope },
      auth: 'basic',
    })
  }

  listOrganizations(signal?: AbortSignal) {
    return this.request<Organization[]>('/v1/orgs', { signal })
  }

  listSupportGroups(signal?: AbortSignal) {
    return this.request<SupportGroup[]>('/v1/support-groups', { signal })
  }

  groupMembership(groupId: string) {
    return this.request<GroupJoin>(`/v1/support-groups/${enc(groupId)}/membership`, {
      auth: 'basic',
    })
  }

  joinSupportGroup(groupId: string) {
    return this.request<GroupJoin>(`/v1/support-groups/${enc(groupId)}/join`, {
      method: 'POST', body: {}, auth: 'basic',
    })
  }

  leaveSupportGroup(groupId: string) {
    return this.request<GroupJoin>(`/v1/support-groups/${enc(groupId)}/membership`, {
      method: 'DELETE', auth: 'basic',
    })
  }

  supportGroupRecipients(groupId: string) {
    return this.request<RoomRecipients>(`/v1/support-groups/${enc(groupId)}/recipients`, {
      auth: 'basic',
    })
  }

  refreshSupportGroupRoutingKey(groupId: string) {
    return this.request<Membership>(`/v1/support-groups/${enc(groupId)}/routing-key`, {
      method: 'PUT', body: {}, auth: 'basic',
    })
  }

  createCircleInvite() {
    return this.request<CircleInvite>('/v1/circle/invites', {
      method: 'POST', body: {}, auth: 'basic',
    })
  }

  claimCircleInvite(code: string) {
    return this.request<CircleClaim>('/v1/circle/invites/claim', {
      method: 'POST', body: { code }, auth: 'basic',
    })
  }

  circleStatus() {
    return this.request<CircleStatus>('/v1/circle', { auth: 'basic' })
  }

  circleRecipients() {
    return this.request<CircleRecipients>('/v1/circle/recipients', { auth: 'basic' })
  }

  refreshCircleRoutingKey() {
    return this.request<CircleStatus>('/v1/circle/routing-key', {
      method: 'PUT', body: {}, auth: 'basic',
    })
  }

  removeCircleMember(circleId: string, peerPubkey: string) {
    return this.request<CircleStatus>(
      `/v1/circle/${enc(circleId)}/members/${enc(peerPubkey)}`,
      { method: 'DELETE', auth: 'basic' },
    )
  }

  blockPeer(peerPubkey: string) {
    return this.request<{ blocked_pubkey: string; active: boolean }>(
      `/v1/blocks/${enc(peerPubkey)}`,
      { method: 'PUT', body: {}, auth: 'basic' },
    )
  }

  unblockPeer(peerPubkey: string) {
    return this.request<{ blocked_pubkey: string; active: boolean }>(
      `/v1/blocks/${enc(peerPubkey)}`,
      { method: 'DELETE', auth: 'basic' },
    )
  }

  createReport(input: {
    subject_pubkey: string
    reason: 'harassment' | 'personal_details' | 'impersonation' | 'spam' | 'other'
    evidence?: string[] | null
  }) {
    return this.request<SafetyReport>('/v1/reports', {
      method: 'POST', body: input, auth: 'basic',
    })
  }

  setCounselorAvailability(available: boolean, workingHours: string | null) {
    return this.request<CounselorAvailability>('/v1/counselors/me/availability', {
      method: 'PUT',
      body: { available, working_hours: workingHours },
      auth: 'basic',
    })
  }

  applyOrganization(application: OrganizationApplication) {
    return this.request<Organization>('/v1/orgs', {
      method: 'POST',
      body: application,
      auth: 'basic',
    })
  }

  myOrganization() {
    return this.request<OrganizationAccess>('/v1/orgs/me', { auth: 'basic' })
  }

  organizationDashboard(orgId: string) {
    return this.request<OrganizationDashboard>(`/v1/orgs/${enc(orgId)}/dashboard`, {
      auth: 'basic',
    })
  }

  listCounselors(orgId: string, signal?: AbortSignal) {
    return this.request<CounselorDirectory>(`/v1/orgs/${enc(orgId)}/counsellors`, { signal })
  }

  publishRoster(orgId: string, event: NostrEvent) {
    return this.request<CounselorDirectory>(`/v1/orgs/${enc(orgId)}/roster`, {
      method: 'PUT',
      body: event,
    })
  }

  authorizeOperationalKey(orgId: string, event: NostrEvent) {
    return this.request<OperationalKey>(`/v1/orgs/${enc(orgId)}/operational-keys`, {
      method: 'PUT',
      body: event,
    })
  }

  listOperationalKeys(orgId: string) {
    return this.request<OperationalKey[]>(`/v1/orgs/${enc(orgId)}/operational-keys`, {
      auth: 'basic',
    })
  }

  revokeOperationalKey(orgId: string, pubkey: string, event: NostrEvent) {
    return this.request<OperationalKey>(
      `/v1/orgs/${enc(orgId)}/operational-keys/${enc(pubkey)}/revoke`,
      { method: 'PUT', body: event },
    )
  }

  publishCounselorProfile(orgId: string, pubkey: string, event: NostrEvent) {
    return this.request<Counselor>(
      `/v1/orgs/${enc(orgId)}/counsellors/${enc(pubkey)}/profile`,
      { method: 'PUT', body: event },
    )
  }

  createCounselorInvite(orgId: string, input: CounselorInviteInput) {
    return this.request<CounselorInvite>(`/v1/orgs/${enc(orgId)}/counselor-invites`, {
      method: 'POST',
      body: input,
      auth: { scope: `counselor:invite:${orgId}` },
    })
  }

  listCounselorInvites(orgId: string) {
    return this.request<CounselorInviteRecord[]>(
      `/v1/orgs/${enc(orgId)}/counselor-invites`,
      { auth: 'basic' },
    )
  }

  claimCounselorInvite(inviteCode: string, profileEvent: NostrEvent) {
    return this.request<CounselorEnrollment>('/v1/counselor-enrollments/claim', {
      method: 'POST',
      body: { invite_code: inviteCode, profile_event: profileEvent },
      auth: 'basic',
    })
  }

  listMyCounselorEnrollments() {
    return this.request<CounselorEnrollment[]>('/v1/counselor-enrollments', {
      auth: 'basic',
    })
  }

  getCounselorEnrollment(enrollmentId: string) {
    return this.request<CounselorEnrollment>(
      `/v1/counselor-enrollments/${enc(enrollmentId)}`,
      { auth: 'basic' },
    )
  }

  updateCounselorEnrollmentProfile(enrollmentId: string, profileEvent: NostrEvent) {
    return this.request<CounselorEnrollment>(
      `/v1/counselor-enrollments/${enc(enrollmentId)}/profile`,
      { method: 'PUT', body: { profile_event: profileEvent }, auth: 'basic' },
    )
  }

  submitCounselorCredentials(enrollmentId: string, documents: EncryptedCredential[]) {
    return this.request<CounselorEnrollment>(
      `/v1/counselor-enrollments/${enc(enrollmentId)}/credentials`,
      {
        method: 'PUT',
        body: { documents },
        auth: { scope: `counselor:credentials:${enrollmentId}` },
      },
    )
  }

  listCounselorEnrollments(orgId: string, status?: CounselorEnrollmentFilter) {
    const query = status ? `?status=${enc(status)}` : ''
    return this.request<CounselorEnrollment[]>(
      `/v1/orgs/${enc(orgId)}/counselor-enrollments${query}`,
      { auth: 'basic' },
    )
  }

  reviewCounselorEnrollment(
    orgId: string,
    enrollmentId: string,
    decision: 'request-information' | 'approve' | 'reject',
    message?: string,
  ) {
    return this.request<CounselorEnrollment>(
      `/v1/orgs/${enc(orgId)}/counselor-enrollments/${enc(enrollmentId)}/${decision}`,
      {
        method: 'POST',
        body: { message: message || null },
        auth: { scope: `counselor:review:${orgId}` },
      },
    )
  }

  createSupportGroup(orgId: string, input: SupportGroupInput = {}) {
    return this.request<SupportGroup>(`/v1/orgs/${enc(orgId)}/support-groups`, {
      method: 'POST',
      body: input,
      auth: { scope: `group:create:${orgId}` },
    })
  }

  putSupportGroupMember(
    orgId: string,
    groupId: string,
    pubkey: string,
    membership: MembershipInput,
  ) {
    return this.request<Membership>(
      `/v1/orgs/${enc(orgId)}/support-groups/${enc(groupId)}/members/${enc(pubkey)}`,
      {
        method: 'PUT',
        body: membership,
        auth: { scope: `group:member:${groupId}` },
      },
    )
  }

  removeSupportGroupMember(orgId: string, groupId: string, pubkey: string) {
    return this.request<Membership>(
      `/v1/orgs/${enc(orgId)}/support-groups/${enc(groupId)}/members/${enc(pubkey)}`,
      { method: 'DELETE', auth: { scope: `group:member:${groupId}` } },
    )
  }

  createDisbursement(
    orgId: string,
    disbursement: DisbursementInput,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    return this.request<Disbursement>(`/v1/orgs/${enc(orgId)}/disbursements`, {
      method: 'POST',
      body: disbursement,
      headers: { 'Idempotency-Key': idempotencyKey },
      auth: { scope: `disbursement:create:${orgId}` },
    })
  }

  approveDisbursement(disbursementId: string) {
    return this.request<Disbursement>(`/v1/disbursements/${enc(disbursementId)}/approve`, {
      method: 'POST',
      auth: { scope: `disbursement:approve:${disbursementId}` },
    })
  }

  getDisbursement(disbursementId: string) {
    return this.request<Disbursement>(`/v1/disbursements/${enc(disbursementId)}`, {
      auth: 'basic',
    })
  }

  listDisbursements(orgId: string, state?: Disbursement['state']) {
    const query = state ? `?state=${enc(state)}` : ''
    return this.request<Disbursement[]>(`/v1/orgs/${enc(orgId)}/disbursements${query}`, {
      auth: 'basic',
    })
  }

  listAdminOrganizations(status: OrganizationStatus = 'pending') {
    return this.request<Organization[]>(`/v1/admin/orgs?status=${enc(status)}`, { auth: 'basic' })
  }

  approveOrganization(orgId: string) {
    return this.request<Organization>(`/v1/admin/orgs/${enc(orgId)}/approve`, {
      method: 'POST',
      auth: { scope: `admin:org:approve:${orgId}` },
    })
  }

  suspendOrganization(orgId: string) {
    return this.request<Organization>(`/v1/admin/orgs/${enc(orgId)}/suspend`, {
      method: 'POST',
      auth: { scope: `admin:org:suspend:${orgId}` },
    })
  }
}

export const publicApi = new ResilienceApi()

export const createAuthenticatedApi = (
  withPrivateKey: ConstructorParameters<typeof NostrHttpSigner>[0],
  options: Omit<ApiClientOptions, 'signer'> = {},
) => new ResilienceApi({ ...options, signer: new NostrHttpSigner(withPrivateKey) })

export type { ClientConfiguration }
