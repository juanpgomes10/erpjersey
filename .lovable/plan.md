## Objetivo
Reformular o fluxo de cadastro de venda para incluir fornecedor/origem expandido, código de rastreamento opcional, criação automática de pedido vinculado e edição posterior em Vendas e Pedidos.

## 1. Banco de dados (migration)

**Tabela `sales`** — adicionar:
- `supplier_name text` (nome do fornecedor quando China/BR)
- `tracking_code text` (rastreio opcional)
- `order_id uuid references public.orders(id) on delete set null` (vínculo 1:1 venda↔pedido)

**Tabela `orders`** — adicionar:
- `supplier_name text`
- `tracking_code text`

**Enum `sale_source`** — adicionar valores:
- `fornecedor_china`
- `revendedor_br`

(Mantém `estoque`, `drop`, `loja_parceira` para compatibilidade; UI nova só mostra os 3 novos rótulos.)

**Tabela `imports`** — sem mudança estrutural; usaremos `tracking_code` + `supplier` existentes.

## 2. Cadastro de venda (`src/routes/_authenticated/vendas.tsx`)

Substituir o `Select` simples de origem por uma seção com `Tabs` (sub-abas) de 3 opções:

```text
[ Estoque da loja ] [ Fornecedor China ] [ Revendedor BR ]
```

- **Estoque da loja** → comportamento atual (desconta estoque via trigger).
- **Fornecedor China** → mostra campo "Nome do fornecedor" (opcional).
- **Revendedor BR** → mostra campo "Nome do revendedor" (opcional).

Abaixo, novo campo:
- **Código de rastreamento** (opcional, texto).

Texto auxiliar abaixo dos dois campos:
> *Você pode preencher isso depois. Vendas sem rastreamento entram em Pedidos Pendentes.*

## 3. Regra de status / criação de pedido

Ao salvar uma venda:
1. Sempre cria registro em `sales` (como hoje).
2. Sempre cria registro correspondente em `orders` com os mesmos itens, snapshot de cliente, valores, `supplier_name`, `tracking_code`, `source`.
3. Status do pedido:
   - Se origem = `estoque` E `tracking_code` preenchido → `pago`.
   - Se faltar `tracking_code` (ou origem China/BR sem rastreio) → `pendente`.
4. Vincular `sales.order_id = orders.id`.
5. Se `tracking_code` informado, criar/atualizar linha em `imports` com `tracking_code`, `supplier`, `linked_order_ids` apontando para o pedido criado (reusa lógica já existente em `registerTracking` quando aplicável).

## 4. Edição de vendas e pedidos

**Vendas** — converter cada linha da tabela em clicável, abrindo um `Sheet` de detalhe com edição dos campos:
- Cliente (nome/telefone/endereço)
- Fornecedor (origem + nome)
- Código de rastreamento
- Pagamento, valor pago, líquido, frete, observações
- Botão "Salvar alterações" que atualiza `sales` e propaga para `orders` vinculado.

**Pedidos** — o `OrderDetailDrawer` já existe; adicionar:
- Edição inline de fornecedor (origem + nome) e código de rastreamento.
- Botão "Salvar" que persiste em `orders` (e em `sales` quando houver `sales.order_id`).
- Se rastreamento for adicionado aqui, criar entrada em `imports` automaticamente.

## 5. Detalhes técnicos

- Usar `useMutation` + `qc.invalidateQueries(['sales','orders','imports'])` para sincronizar listas.
- Tipos: regenerar `types.ts` automaticamente após a migration.
- Manter `SOURCE_OPTIONS` retrocompatível (mapear `drop→fornecedor_china`, `loja_parceira→revendedor_br` apenas para exibição de vendas antigas).
- Sem mudanças em edge functions; tudo via cliente Supabase com RLS já existente.

## Arquivos afetados

- `supabase/migrations/<novo>.sql` (nova migration)
- `src/routes/_authenticated/vendas.tsx` (form + drawer de edição)
- `src/routes/_authenticated/pedidos.tsx` (edição no drawer)
- `src/integrations/supabase/types.ts` (auto-gerado)