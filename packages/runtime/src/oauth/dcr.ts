export interface ClientMetadata {
  client_name: string
  redirect_uris: string[]
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?:
    | 'none'
    | 'client_secret_basic'
    | 'client_secret_post'
  scope?: string
}

export interface ClientRegistration {
  client_id: string
  client_secret?: string
  registration_access_token?: string
  registration_client_uri?: string
  client_id_issued_at?: number
  client_secret_expires_at?: number
}

const DEFAULT_GRANT_TYPES = ['authorization_code', 'refresh_token']
const DEFAULT_RESPONSE_TYPES = ['code']

export async function registerClient(
  registrationEndpoint: string,
  metadata: ClientMetadata,
): Promise<ClientRegistration> {
  const body = {
    ...metadata,
    grant_types: metadata.grant_types ?? DEFAULT_GRANT_TYPES,
    response_types: metadata.response_types ?? DEFAULT_RESPONSE_TYPES,
  }

  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      // response body unreadable; surface status alone
    }
    throw new Error(
      `DCR registration failed: HTTP ${res.status} ${res.statusText} ${detail.slice(0, 200)}`,
    )
  }

  const parsed = (await res.json()) as Partial<ClientRegistration>
  if (!parsed.client_id) {
    throw new Error('DCR response missing client_id')
  }
  return parsed as ClientRegistration
}
