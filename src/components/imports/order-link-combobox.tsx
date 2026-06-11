import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

type OrderOption = {
  id: string;
  order_number: number | null;
  customer_name: string | null;
};

export function OrderLinkCombobox({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: orders = [] } = useQuery({
    queryKey: ["orders-link"],
    queryFn: async (): Promise<OrderOption[]> => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, customers(name)")
        .order("order_number", { ascending: false })
        .limit(200);
      return (data ?? []).map((o) => ({
        id: o.id as string,
        order_number: (o.order_number as number | null) ?? null,
        customer_name:
          ((o as unknown as { customers?: { name?: string } | null }).customers?.name ?? null),
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders.slice(0, 50);
    return orders
      .filter(
        (o) =>
          String(o.order_number ?? "").includes(q) ||
          (o.customer_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [orders, query]);

  const selected = orders.filter((o) => value.includes(o.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-muted-foreground">
              {value.length > 0 ? `${value.length} pedido(s) vinculado(s)` : "Buscar pedido por nº ou cliente…"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar..." value={query} onValueChange={setQuery} />
            <CommandList className="pointer-events-auto">
              <CommandEmpty>Nenhum pedido encontrado.</CommandEmpty>
              <CommandGroup>
                {filtered.map((o) => {
                  const isSel = value.includes(o.id);
                  return (
                    <CommandItem
                      key={o.id}
                      value={o.id}
                      onSelect={() => {
                        const next = isSel
                          ? value.filter((id) => id !== o.id)
                          : [...value, o.id];
                        onChange(next);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", isSel ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono tabular text-xs">
                        #{String(o.order_number ?? "").padStart(4, "0")}
                      </span>
                      <span className="ml-2 truncate">{o.customer_name ?? "—"}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((o) => (
            <Badge key={o.id} variant="outline" className="gap-1">
              #{String(o.order_number ?? "").padStart(4, "0")} · {o.customer_name ?? "—"}
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== o.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
