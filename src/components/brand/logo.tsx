import logoAsset from "@/assets/erpjersey-mark-v2.png.asset.json";

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/** Símbolo — usado em espaços compactos (favicon, avatares, ícones). */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="ERPJersey"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

/** Logo principal. */
export function Logo({ size = 28, withWordmark = true, className = "" }: LogoProps) {
  const height = withWordmark ? Math.round(size * 1.4) : size;
  return (
    <img
      src={logoAsset.url}
      alt="ERPJersey"
      className={className}
      style={{ height, width: "auto", objectFit: "contain" }}
    />
  );
}

/** Variante grande — usada em telas de marca/onboarding/auth. */
export function LogoBag({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="ERPJersey"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
