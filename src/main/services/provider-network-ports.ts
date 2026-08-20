export interface ProviderResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

export interface ProviderDnsResolutionPort {
  resolve(hostname: string): Promise<readonly ProviderResolvedAddress[]>
}

export interface ProviderPinnedBinding {
  readonly addresses: readonly ProviderResolvedAddress[]
  readonly hostname: string
}

export interface ProviderPinnedRequestPort {
  request(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    binding: ProviderPinnedBinding,
  ): Promise<Response>
}
