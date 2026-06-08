export const fmtBRL = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);

export const fmtDate = (iso: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    typeof iso === "string" ? new Date(iso) : iso,
  );

export const fmtDateTime = (iso: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);

export const paymentMethodLabel: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão crédito",
  cartao_debito: "Cartão débito",
  fiado: "Fiado",
  transferencia: "Transferência",
  outro: "Outro",
};
