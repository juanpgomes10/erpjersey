import markAsset from "@/assets/erpjersey-mark.png.asset.json";
import wordmarkDarkAsset from "@/assets/erpjersey-wordmark-dark.png.asset.json";
import wordmarkLightAsset from "@/assets/erpjersey-wordmark-light.png.asset.json";
import bagAsset from "@/assets/erpjersey-bag.png.asset.json";
import { assetUrl } from "@/lib/asset-url";

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/** Símbolo "EJ" — usado em espaços compactos (favicon, avatares, ícones). */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={assetUrl(markAsset)}
      alt="ERPJersey"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

/** Logo completo com marca "EJ" + wordmark "ERP Jersey". Variante automática por tema. */
export function Logo({ size = 28, withWordmark = true, className = "", overrideUrl }: LogoProps & { overrideUrl?: string | null }) {
  if (overrideUrl) {
    const height = Math.round(size * 1.4);
    return (
      <img
        src={overrideUrl}
        alt="Logo"
        className={className}
        style={{ height, width: "auto", maxWidth: 160, objectFit: "contain" }}
      />
    );
  }
  if (!withWordmark) {
    return <LogoMark size={size} className={className} />;
  }
  const height = Math.round(size * 1.4);
  const baseStyle = { height, width: "auto", objectFit: "contain" as const };
  return (
    <>
      <img
        src={assetUrl(wordmarkDarkAsset)}
        alt="ERPJersey"
        className={`hidden dark:block ${className}`}
        style={baseStyle}
      />
      <img
        src={assetUrl(wordmarkLightAsset)}
        alt="ERPJersey"
        className={`block dark:hidden ${className}`}
        style={baseStyle}
      />
    </>
  );
}

/** Variante "sacola" — usada em telas de marca/onboarding/auth como ilustração principal. */
export function LogoBag({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={assetUrl(bagAsset)}
      alt="ERPJersey"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
