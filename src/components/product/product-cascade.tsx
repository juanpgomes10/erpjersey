import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TEAMS,
  TEAM_CATEGORY_LABELS,
  PRODUCT_TYPES,
  MODELS,
  GENDERS,
  searchTeams,
  teamLabel,
  type Gender,
  type TeamCategory,
} from "@/lib/teams";
import { sizesForGender } from "@/lib/teams";

export type ProductCascadeValue = {
  team: string;
  season: string;
  productType: string;
  model: string;
  specialEdition: string;
  gender: Gender;
  size: string | null;
};

export type ProductCascadeProps = {
  value: ProductCascadeValue;
  onChange: (v: ProductCascadeValue) => void;
  /** Esconde o campo de tamanho (ex.: estoque, que coleta por grade). */
  hideSize?: boolean;
};

export function ProductCascade({ value, onChange, hideSize }: ProductCascadeProps) {
  const set = <K extends keyof ProductCascadeValue>(k: K, v: ProductCascadeValue[K]) =>
    onChange({ ...value, [k]: v });

  const sizes = useMemo(
    () => sizesForGender(value.gender, value.productType),
    [value.gender, value.productType],
  );

  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1.5 block">Time / Seleção*</Label>
        <TeamCombobox value={value.team} onChange={(v) => set("team", v)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Temporada</Label>
          <Input
            value={value.season}
            onChange={(e) => set("season", e.target.value)}
            placeholder="Ex.: 2025/2026"
          />
        </div>
        <div>
          <Label>Produto*</Label>
          <Select
            value={value.productType}
            onValueChange={(v) => {
              const next: ProductCascadeValue = { ...value, productType: v };
              if (v === "kit_infantil") next.gender = "infantil";
              onChange(next);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {PRODUCT_TYPES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Modelo*</Label>
        <Select value={value.model} onValueChange={(v) => set("model", v)}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value.model === "edicao_especial" && (
          <Input
            className="mt-2"
            value={value.specialEdition}
            onChange={(e) => set("specialEdition", e.target.value)}
            placeholder="Qual edição especial? Ex.: Outubro Rosa, 120 anos..."
          />
        )}
      </div>

      <div>
        <Label className="mb-1.5 block">Gênero*</Label>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => set("gender", g.value)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${value.gender === g.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {!hideSize && (
        <div>
          <Label className="mb-1.5 block">Tamanho*</Label>
          <div className="flex flex-wrap gap-2">
            {sizes.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => set("size", sz)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${value.size === sz ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const list = searchTeams(query);
    const map = new Map<TeamCategory, typeof TEAMS>();
    for (const t of list) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return Array.from(map.entries());
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value ? teamLabel(value) : "Selecione um time ou seleção..."}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (ex.: brasil, seleção espanhola, real madrid...)"
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {grouped.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum time encontrado.</p>
          ) : (
            grouped.map(([cat, list]) => (
              <div key={cat} className="mb-2">
                <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {TEAM_CATEGORY_LABELS[cat]}
                </div>
                {list.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => { onChange(t.value); setOpen(false); setQuery(""); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      value === t.value && "bg-accent",
                    )}
                  >
                    <span className="truncate">{t.label}</span>
                    {value === t.value && <Check className="ml-2 h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function emptyCascadeValue(): ProductCascadeValue {
  return {
    team: "selecao-brasil",
    season: "",
    productType: "camisa_torcedor",
    model: "1",
    specialEdition: "",
    gender: "masculina",
    size: null,
  };
}
