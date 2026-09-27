// The browser API used by KurdStay; runtime implementation is the pinned upstream bundle.
export interface UploadOptions {
  endpoint: string
  headers: Record<string, string>
  chunkSize: number
  retryDelays: number[]
  uploadDataDuringCreation: boolean
  storeFingerprintForResuming: boolean
  metadata: Record<string, string>
  onProgress: (sent: number, total: number) => void
  onError: (error: Error) => void
  onSuccess: () => void
}
export class Upload {
  constructor(file: File | Blob, options: UploadOptions)
  options: UploadOptions
  start(): void
  abort(shouldTerminate?: boolean): Promise<void>
}
