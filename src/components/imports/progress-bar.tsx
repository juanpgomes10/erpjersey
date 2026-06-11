import { cn } from "@/lib/utils";

const STAGES = [
  { key: "comprado", label: "Comprado" },
  { key: "enviado", label: "Enviado" },
  { key: "em_transito", label: "Em trânsito" },
  { key: "chegou_brasil", label: "Chegou ao BR" },
  { key: "aguardando_taxa", label: "Pagto tributos" },
  { key: "saiu_entrega", label: "Saiu p/ entrega" },
  { key: "entregue", label: "Entregue" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

export function ImportProgressBar({ status }: { status: string }) {
  const isBarrado = status === "barrado_alfandega";
  const isCancelado = status === "cancelado";

  // Para 'barrado_alfandega' tratamos como se estivesse na etapa de chegada
  const effective: StageKey = isBarrado
    ? "chegou_brasil"
    : (STAGES.some((s) => s.key === status) ? (status as StageKey) : "comprado");
  const currentIdx = STAGES.findIndex((s) => s.key === effective);

  return (
    <div className="w-full">
      <div className="flex items-center gap-1">
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const current = idx === currentIdx;
          return (
            <div key={stage.key} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  done || current
                    ? isBarrado
                      ? "bg-[#EF4444]"
                      : "bg-[#2563EB]"
                    : "bg-[#1E293B]",
                  current && !isBarrado && "animate-pulse",
                  isCancelado && "bg-[#64748B]",
                )}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 hidden grid-cols-7 gap-1 text-[10px] text-muted-foreground sm:grid">
        {STAGES.map((s, idx) => (
          <span
            key={s.key}
            className={cn(
              "truncate text-center",
              idx === currentIdx && !isBarrado && "font-semibold text-[#2563EB]",
              idx === currentIdx && isBarrado && "font-semibold text-[#EF4444]",
              idx < currentIdx && "text-foreground/70",
            )}
            title={s.label}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
