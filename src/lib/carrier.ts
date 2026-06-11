// Detecção heurística da transportadora a partir do código de rastreamento.
// Retorna um nome amigável + bandeira do país de origem provável.

export type CarrierGuess = {
  name: string;
  country: "cn" | "br" | "us" | "other";
  flag: string;
};

export function detectCarrier(code: string): CarrierGuess | null {
  const c = code.trim().toUpperCase();
  if (c.length < 8) return null;

  // China Post / EMS / Cainiao — geralmente terminam em CN
  if (/CN$/.test(c)) {
    if (c.startsWith("LP")) return { name: "Cainiao", country: "cn", flag: "🇨🇳" };
    if (c.startsWith("YT")) return { name: "Yanwen", country: "cn", flag: "🇨🇳" };
    if (c.startsWith("UB")) return { name: "Sunyou", country: "cn", flag: "🇨🇳" };
    return { name: "China Post", country: "cn", flag: "🇨🇳" };
  }

  // Correios BR: 2 letras + 9 dígitos + BR
  if (/^[A-Z]{2}\d{9}BR$/.test(c)) {
    return { name: "Correios", country: "br", flag: "🇧🇷" };
  }

  // Objeto nacional Correios: PI/PH/etc com 9 dígitos
  if (/^[A-Z]{2}\d{9}$/.test(c)) {
    return { name: "Correios", country: "br", flag: "🇧🇷" };
  }

  // USPS
  if (/^9\d{15,21}$/.test(c) || /US$/.test(c)) {
    return { name: "USPS", country: "us", flag: "🇺🇸" };
  }

  return null;
}

export const COUNTRY_FLAG: Record<string, string> = {
  cn: "🇨🇳",
  br: "🇧🇷",
  us: "🇺🇸",
  other: "🌐",
};

export const COUNTRY_LABEL: Record<string, string> = {
  cn: "China",
  br: "Brasil",
  us: "EUA",
  other: "Outro",
};
