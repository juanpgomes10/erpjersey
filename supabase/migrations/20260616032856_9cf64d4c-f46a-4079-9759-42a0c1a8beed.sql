
UPDATE public.imports
SET
  status = 'entregue',
  tracking_status_raw = 'Delivered',
  carrier = COALESCE(carrier, 'Correios'),
  carrier_code = COALESCE(carrier_code, '2151'),
  last_tracking_update = now(),
  tracking_events = '[
    {"time":"2026-06-15T14:57:57-03:00","description":"Objeto entregue ao destinatário","location":"PR","stage":"Delivered"},
    {"time":"2026-06-15T10:08:31-03:00","description":"Objeto saiu para entrega ao destinatário","location":"PR","stage":"OutForDelivery"},
    {"time":"2026-06-12T19:06:35-03:00","description":"Objeto em transferência - por favor aguarde","location":"PR","stage":null},
    {"time":"2026-06-10T23:46:53-03:00","description":"Objeto em transferência - por favor aguarde","location":"MG","stage":null},
    {"time":"2026-06-10T23:46:33-03:00","description":"Objeto em correção de rota","location":"MG","stage":null},
    {"time":"2026-06-10T19:40:23-03:00","description":"Objeto em transferência - por favor aguarde","location":"MG","stage":null},
    {"time":"2026-06-10T19:40:03-03:00","description":"Objeto em correção de rota","location":"MG","stage":null},
    {"time":"2026-06-10T10:24:11-03:00","description":"Objeto em transferência - por favor aguarde","location":"MG","stage":null},
    {"time":"2026-06-10T10:00:31-03:00","description":"Objeto postado","location":"MG","stage":null},
    {"time":"2026-06-08T15:02:46-03:00","description":"Etiqueta emitida","location":"BR","stage":"InfoReceived"}
  ]'::jsonb
WHERE tracking_code = 'AP053038056BR';
