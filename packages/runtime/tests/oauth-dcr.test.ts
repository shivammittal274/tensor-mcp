import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { type ClientMetadata, registerClient } from '../src/oauth/dcr'

const VALID_METADATA: ClientMetadata = {
  client_name: 'tensor-mcp',
  redirect_uris: ['http://127.0.0.1:54321/callback'],
  token_endpoint_auth_method: 'none',
  scope: 'read write',
}

describe('registerClient', () => {
  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('POSTs metadata as JSON to the registration endpoint', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    globalThis.fetch = mock(async (url: any, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedInit = init
      return new Response(JSON.stringify({ client_id: 'abc123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      // biome-ignore lint/suspicious/noExplicitAny: assign to global fetch
    }) as any

    await registerClient('https://mcp.linear.app/register', VALID_METADATA)

    expect(capturedUrl).toBe('https://mcp.linear.app/register')
    expect(capturedInit?.method).toBe('POST')
    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('content-type')).toContain('application/json')
    const body = JSON.parse(capturedInit?.body as string)
    expect(body.client_name).toBe('tensor-mcp')
    expect(body.redirect_uris).toEqual(VALID_METADATA.redirect_uris)
  })

  it('applies default grant_types and response_types if omitted', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    let capturedBody: any = null
    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    globalThis.fetch = mock(async (_url: any, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string)
      return new Response(JSON.stringify({ client_id: 'abc' }), { status: 201 })
      // biome-ignore lint/suspicious/noExplicitAny: assign to global fetch
    }) as any

    await registerClient('https://example.com/register', {
      client_name: 'x',
      redirect_uris: ['http://127.0.0.1/cb'],
    })

    expect(capturedBody.grant_types).toEqual([
      'authorization_code',
      'refresh_token',
    ])
    expect(capturedBody.response_types).toEqual(['code'])
  })

  it('returns parsed ClientRegistration on 200', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            client_id: 'cid_xyz',
            client_secret: 'csec_abc',
            registration_access_token: 'regtok',
            client_id_issued_at: 1700000000,
          }),
          { status: 200 },
        ),
      // biome-ignore lint/suspicious/noExplicitAny: assign to global fetch
    ) as any

    const reg = await registerClient(
      'https://example.com/register',
      VALID_METADATA,
    )
    expect(reg.client_id).toBe('cid_xyz')
    expect(reg.client_secret).toBe('csec_abc')
    expect(reg.registration_access_token).toBe('regtok')
    expect(reg.client_id_issued_at).toBe(1700000000)
  })

  it('accepts 201 Created as success', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ client_id: 'abc' }), { status: 201 }),
      // biome-ignore lint/suspicious/noExplicitAny: assign to global fetch
    ) as any
    const reg = await registerClient(
      'https://example.com/register',
      VALID_METADATA,
    )
    expect(reg.client_id).toBe('abc')
  })

  it('throws on non-2xx response', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_client_metadata' }), {
          status: 400,
        }),
      // biome-ignore lint/suspicious/noExplicitAny: assign to global fetch
    ) as any
    await expect(
      registerClient('https://example.com/register', VALID_METADATA),
    ).rejects.toThrow(/registration failed|400|invalid_client_metadata/i)
  })

  it('throws if response is missing client_id', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ not_a_client_id: 'oops' }), {
          status: 200,
        }),
      // biome-ignore lint/suspicious/noExplicitAny: assign to global fetch
    ) as any
    await expect(
      registerClient('https://example.com/register', VALID_METADATA),
    ).rejects.toThrow(/client_id/)
  })

  it('propagates network errors', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('network unreachable')
      // biome-ignore lint/suspicious/noExplicitAny: assign to global fetch
    }) as any
    await expect(
      registerClient('https://example.com/register', VALID_METADATA),
    ).rejects.toThrow(/network/)
  })
})
