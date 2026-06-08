interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * Símbolo ERPJersey: sacola dark com alça azul.
 * 2 traços brancos formam o "E", traço azul claro forma o "J".
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ERPJersey"
    >
      {/* Alça */}
      <path
        d="M13 12 C 13 7, 27 7, 27 12"
        stroke="#2563EB"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Sacola */}
      <rect x="7" y="11" width="26" height="24" rx="3" fill="#0F172A" stroke="#1E293B" strokeWidth="1" />
      {/* "E" traços brancos */}
      <rect x="13" y="17" width="10" height="2" rx="1" fill="#FFFFFF" />
      <rect x="13" y="22" width="7" height="2" rx="1" fill="#FFFFFF" />
      {/* "J" traço azul claro */}
      <path
        d="M19 27 L19 30 Q 19 32, 17 32"
        stroke="#93BFFF"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ size = 28, withWordmark = true, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {withWordmark && (
        <span className="font-sora text-lg font-semibold tracking-tight">
          <span style={{ color: "#2563EB" }}>ERP</span>
          <span className="text-foreground">Jersey</span>
        </span>
      )}
    </div>
  );
}
