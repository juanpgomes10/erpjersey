## Resumo

Vou expandir o módulo de Importações com toda a UX que você descreveu — barra de progresso de 7 etapas, métricas detalhadas, autocompletar de pedidos, datepicker, conversão USD→BRL, atualização automática, confete na entrega, estado vazio ilustrado, etc. Mantenho o design system atual (#0F172A / #111827 / #2563EB, Sora + Inter) e reaproveito os componentes existentes.

## ⚠️ Ponto importante sobre segurança da API Key

Sua spec tem duas instruções conflitantes:
- "ler a chave de `VITE_17TRACK_API_KEY`"
- "Nunca expor a API Key no frontend — usar Edge Function como proxy"

Vou seguir a **segunda regra** (a correta). A `17TRACK_API_KEY` já está armazenada como secret server-side e o projeto já usa **server functions do TanStack Start** (`createServerFn`) — que é o equivalente moderno ao "edge function como proxy" e é a forma recomendada no nosso stack. Não vou criar `src/services/tracking17.ts` no frontend; vou expandir o `src/lib/tracking.functions.ts` que já existe. Funcionalmente é idêntico — só não vaza a key.

## Banco de dados

Migration na tabela `imports`:
- `tracking_status_raw text` — status cru do 17TRACK
- `last_tracked_at timestamptz` (já temos `last_tracking_update`, vou usar o existente e adicionar este como alias se necessário)
- `carrier_code text` — código numérico da transportadora detectada
- `value_usd numeric`, `expected_delivery date` (já existe)
- `linked_order_ids uuid[]` — IDs dos pedidos vinculados (complementar ao `order_numbers int[]` já existente)

## Server functions (`src/lib/tracking.functions.ts`)

- `registerTracking(code)` — registra novo código no 17TRACK na criação
- `refreshTracking(importId)` — já existe, vou melhorar o mapeamento de status para cobrir: NotFound, InfoReceived, InTransit, Pickup, OutForDelivery, Delivered, Exception, CustomsHold
- `refreshAllTrackings()` — atualiza em lote todas importações não-entregues/não-barradas (chamada ao abrir a página)
- Detecção de transportadora (Correios, CAINIAO, Yanwen, China Post) via prefixo do código

## Tela `/importacoes`

**Header**
- Título + "Última atualização: há X min" + botão "Atualizar todos" + botão "Nova importação"
- Auto-refresh ao montar a página (1x por sessão, throttled a 5 min)

**4 cards de métricas**
- Em andamento (qtd + média de dias em trânsito)
- Aguardando taxa (qtd + valor total R$ das taxas)
- Barrado (qtd, badge vermelho pulsante se > 0)
- Entregues este mês (qtd)

**Cards por importação**
- Código + botão copiar (Clipboard API + toast)
- Bandeira do país + fornecedor + transportadora detectada
- **Barra de progresso de 7 etapas** (Comprado → Enviado → Em trânsito → Chegou ao Brasil → Aguardando taxa → Saiu para entrega → Entregue) com cores #2563EB / pulse / #1E293B
- Último evento + data/hora
- Miniaturas de até 3 fotos + "+X mais"
- Badges de pedidos vinculados (clicáveis → /pedidos)
- Botões "Atualizar" e "Ver detalhes"

**Drawer de detalhes**
- Timeline vertical completa de eventos
- Grid de fotos + botão "Adicionar mais"
- Pedidos vinculados (links)
- Observações editáveis inline
- Botão "Marcar como entregue manualmente"

**Estado vazio**
- Ilustração SVG inline de caixa
- Texto + CTA "+ Nova importação"

## Modal "Nova importação"

**Obrigatórios**
- Código de rastreio (mín. 8 chars). Ao `onBlur`, registra no 17TRACK com spinner e mostra badge "Transportadora detectada: X" (verde) ou "não detectada" (amarelo).
- Fornecedor (texto) + seletor de país (🇨🇳 / 🇧🇷 / 🇺🇸 / Outro)

**Seção expansível "Informações adicionais"**
- Vincular pedidos: Combobox com autocomplete (busca por nº ou nome do cliente), multi-seleção, salva em `linked_order_ids`
- Fotos: upload múltiplo (máx 5MB cada, JPG/PNG/WEBP) → `import-photos/{storeId}/{importId}/`
- Valor USD + preview "≈ R$ X,XX" (taxa fixa 5,80)
- Previsão de entrega (Calendar shadcn)
- Observações (Textarea)

## Notificações

Já temos sistema de notificações + sino. Vou:
- Manter o mapeamento existente (info/urgent)
- Adicionar **confete** (canvas-confetti) quando status muda para `entregue`
- Garantir toasts: aguardando_taxa = vermelho, barrado = vermelho urgente, saiu_entrega = verde, entregue = verde + confete

## Arquivos

**Novos**
- `src/components/imports/progress-bar.tsx` — barra de 7 etapas
- `src/components/imports/empty-state.tsx` — SVG + CTA
- `src/components/imports/order-link-combobox.tsx` — autocomplete de pedidos
- `supabase/migrations/...sql` — colunas novas

**Editados**
- `src/lib/tracking.functions.ts` — `registerTracking`, `refreshAllTrackings`, mapeamento expandido, detecção de transportadora
- `src/routes/_authenticated/importacoes.tsx` — toda a UI nova
- `package.json` — adicionar `canvas-confetti`

## Confirmação

Posso seguir com este plano? Em particular, confirme que está OK manter a chamada ao 17TRACK via **server function** (segura) em vez de expor `VITE_17TRACK_API_KEY` no frontend.
