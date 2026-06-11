import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImportsEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/70 bg-card/40 py-16 text-center">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="20" y="40" width="80" height="60" rx="4" fill="#1E293B" stroke="#2563EB" strokeWidth="2" />
        <path d="M20 55 L60 70 L100 55" stroke="#2563EB" strokeWidth="2" fill="none" />
        <path d="M60 70 L60 100" stroke="#2563EB" strokeWidth="2" />
        <rect x="50" y="40" width="20" height="10" fill="#2563EB" opacity="0.3" />
        <circle cx="95" cy="35" r="6" fill="#22C55E" />
        <path d="M92 35 L94 37 L98 33" stroke="#fff" strokeWidth="1.5" fill="none" />
        <path d="M10 30 L18 30 M10 35 L22 35" stroke="#2563EB" strokeWidth="1.5" opacity="0.5" />
      </svg>
      <div className="space-y-1">
        <h3 className="font-sora text-lg font-semibold">Nenhuma importação cadastrada</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Adicione o código de rastreio para acompanhar suas encomendas da China e Correios em tempo real.
        </p>
      </div>
      <Button onClick={onCreate} className="bg-[#2563EB] text-white hover:bg-[#1D4ED8]">
        <Plus className="mr-1.5 h-4 w-4" /> Nova importação
      </Button>
    </div>
  );
}
