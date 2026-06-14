import markAsset from "@/assets/erpjersey-mark.png.asset.json";
import wordmarkAsset from "@/assets/erpjersey-wordmark-dark.png.asset.json";
import bagAsset from "@/assets/erpjersey-bag.png.asset.json";

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/** Símbolo "EJ" — usado em espaços compactos (favicon, avatares, ícones). */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={markAsset.url}
      alt="ERPJersey"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

/** Logo completo com marca "EJ" + wordmark "ERP Jersey". Ideal para headers e sidebars. */
export function Logo({ size = 28, withWordmark = true, className = "" }: LogoProps) {
  if (!withWordmark) {
    return <LogoMark size={size} className={className} />;
  }
  // O wordmark já contém o símbolo + texto; usamos altura proporcional.
  const height = Math.round(size * 1.4);
  return (
    <img
      src={wordmarkAsset.url}
      alt="ERPJersey"
      className={className}
      style={{ height, width: "auto", objectFit: "contain" }}
    />
  );
}

/** Variante "sacola" — usada em telas de marca/onboarding/auth como ilustração principal. */
export function LogoBag({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={bagAsset.url}
      alt="ERPJersey"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
