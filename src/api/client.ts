import type { NostrEvent } from 'nostr-tools/pure'
import { runtimeConfig } from '../config/runtime'
import { readClientConfiguration, type ClientConfiguration } from '../messaging/config'
import { NostrHttpSigner } from './nip98'
import type {
  AuthorizationChallenge,
  Counselor,
  CounselorDirectory,
  Disbursement,
  DisbursementInput,
  Health,
  Membership,
  MembershipInput,
  OperationalKey,
  Organization,
  OrganizationApplication,
  OrganizationStatus,
  SupportGroup,
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
    fetcher = fetch,
  }: ApiClientOptions = {}) {
    this.apiBase = apiBase.replace(/\/+$/, '')
    this.signer = signer
    this.fetcher = fetcher
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

    const response = await this.fetcher(url, {
      method,
      body,
      headers,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: options.auth && options.auth !== 'none' ? 'no-store' : 'default',
      signal: options.signal,
    })
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

  applyOrganization(application: OrganizationApplication) {
    return this.request<Organization>('/v1/orgs', {
      method: 'POST',
      body: application,
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

  createSupportGroup(orgId: string) {
    return this.request<SupportGroup>(`/v1/orgs/${enc(orgId)}/support-groups`, {
      method: 'POST',
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
