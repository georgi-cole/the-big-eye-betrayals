export function excludeBetrayalsUnusedAssets(
  root: string,
  outputDirectory: string
): Promise<{ excludedPaths: string[]; excludedBytes: number }>
