/// <reference types="vite/client" />

import type { PivotPreloadApi } from '../shared/types/ipc'

declare global {
  interface Window {
    pivot: PivotPreloadApi
  }
}

export {}
