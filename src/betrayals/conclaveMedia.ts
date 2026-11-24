export function conclaveMedia(path: string) {
  return path.startsWith('assets/') ? import.meta.env.BASE_URL + path : path
}
