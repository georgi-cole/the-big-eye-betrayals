interface MobileSoundtrackAudit {
  excludedFiles: number
  excludedBytes: number
  retainedFiles: number
}

export function excludeMobileBetrayalsSoundtrack(
  root: string,
  outputDirectory: string,
  previouslyExcluded?: readonly string[]
): Promise<MobileSoundtrackAudit>

export function verifyMobileBetrayalsSoundtrack(
  root: string,
  outputDirectory: string,
  previouslyExcluded?: readonly string[]
): Promise<{ retainedFiles: number }>
