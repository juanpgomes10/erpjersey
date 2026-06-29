/**
 * Resolve uma URL de asset Lovable.
 * Assets ficam hospedados apenas no domínio *.lovable.app — em domínios custom
 * (ex.: erpjersey.com) o caminho /__l5e/... retorna 404. Esta função força a
 * resolução pelo domínio publicado quando necessário.
 */
const ASSETS_HOST = "https://erpjersey.lovable.app";

export function assetUrl(asset: { url: string }): string {
  const url = asset.url;
  if (/^https?:\/\//.test(url)) return url;
  if (typeof window === "undefined") return ASSETS_HOST + url;
  const host = window.location.hostname;
  if (host.endsWith(".lovable.app") || host === "localhost" || host === "127.0.0.1") {
    return url;
  }
  return ASSETS_HOST + url;
}
