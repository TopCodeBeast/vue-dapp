import { SafeAppProvider } from '@gnosis.pm/safe-apps-provider'
import SafeAppsSDK, {
  Opts as SafeOpts,
  SafeInfo,
} from '@gnosis.pm/safe-apps-sdk'
import { getAddress } from 'ethers/lib/utils'
import { normalizeChainId } from '../utils'
import { Connector } from './connector'
import {
  ConnectorNotFoundError,
  ProviderNotFoundError,
  ProviderRpcError,
} from './errors'

export const isServer = typeof window === 'undefined'
export const isIframe = !isServer && window?.parent !== window
export const isNotSafeApp = () => {
  const ready = !isServer && isIframe
  return ready ? false : true
}

export class SafeConnector extends Connector<SafeAppProvider, SafeOpts> {
  readonly name = 'safe'
  ready = !isServer && isIframe

  #provider?: SafeAppProvider
  #sdk: SafeAppsSDK
  #safe?: SafeInfo
  #isSafeApp = false

  #onDisconnectHandler?: (error: ProviderRpcError) => void
  #onAccountsChangedHandler?: (accounts: string[]) => void
  #onChainChangedHandler?: (chainId: number) => void

  constructor(options: SafeOpts = {}) {
    super(options)
    this.#sdk = new SafeAppsSDK(options)
  }

  async connect() {
    if (!this.#isSafeApp) {
      const isSafeApp = await this.isSafeApp()
      if (!isSafeApp) {
        throw new ConnectorNotFoundError()
      }
    }

    const provider = await this.getProvider()

    if (!this.#safe) {
      throw new ConnectorNotFoundError()
    }
    getAddress(this.#safe.safeAddress)

    const account = await getAddress(this.#safe.safeAddress)

    return {
      account,
      provider,
    }
  }

  async getProvider() {
    if (!this.#provider) {
      const safe = await this.#getSafeInfo()
      if (!safe) {
        throw new Error('Could not load Safe information')
      }

      this.#provider = new SafeAppProvider(safe, this.#sdk)
    }
    return this.#provider
  }

  async isSafeApp(): Promise<boolean> {
    if (!this.ready) return false

    const safe = await Promise.race([
      this.#getSafeInfo(),
      new Promise<void>((resolve) => setTimeout(resolve, 300)),
    ])
    const isSafeApp = !!safe
    this.#isSafeApp = isSafeApp
    return isSafeApp
  }

  async #getSafeInfo(): Promise<SafeInfo> {
    if (!this.#sdk) {
      throw new ConnectorNotFoundError()
    }
    if (!this.#safe) {
      this.#safe = await this.#sdk.safe.getInfo()
    }
    return this.#safe
  }

  async disconnect() {
    if (!this.#provider) throw new ProviderNotFoundError()

    this.#onDisconnectHandler &&
      this.#removeListener('disconnect', this.#onDisconnectHandler)
    this.#onAccountsChangedHandler &&
      this.#removeListener('accountsChanged', this.#onAccountsChangedHandler)
    this.#onChainChangedHandler &&
      this.#removeListener('chainChanged', this.#onChainChangedHandler)

    this.#provider = undefined
    this.#safe = undefined

    this.#onDisconnectHandler = undefined
    this.#onAccountsChangedHandler = undefined
    this.#onChainChangedHandler = undefined
  }

  onDisconnect(handler: (error: ProviderRpcError) => void) {
    if (!this.#provider) throw new ProviderNotFoundError()
    if (this.#onDisconnectHandler) {
      this.#removeListener('disconnect', this.#onDisconnectHandler)
    }
    this.#onDisconnectHandler = handler
    this.#provider.on('disconnect', handler)
  }

  onAccountsChanged(handler: (accounts: string[]) => void) {
    if (!this.#provider) throw new ProviderNotFoundError()
    if (this.#onAccountsChangedHandler) {
      this.#removeListener('accountsChanged', this.#onAccountsChangedHandler)
    }
    this.#onAccountsChangedHandler = handler
    this.#provider.on('accountsChanged', handler)
  }

  onChainChanged(handler: (chainId: number) => void) {
    if (!this.#provider) throw new ProviderNotFoundError()
    if (this.#onChainChangedHandler) {
      this.#removeListener('chainChanged', this.#onChainChangedHandler)
    }
    this.#onChainChangedHandler = handler
    this.#provider.on('chainChanged', (chainId: string) => {
      const _chainId = normalizeChainId(chainId)
      handler(_chainId)
    })
  }
  #removeListener(event: string, handler: (...args: any[]) => void) {
    if (!this.#provider) throw new ProviderNotFoundError()
    this.#provider.removeListener(event, handler)
  }
}
