
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor', 'financeiro');
CREATE TYPE public.payment_method AS ENUM ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'fiado', 'transferencia', 'outro');
CREATE TYPE public.sale_status AS ENUM ('concluida', 'cancelada');
CREATE TYPE public.order_status AS ENUM ('pendente', 'pago', 'enviado', 'entregue', 'cancelado');
CREATE TYPE public.transaction_type AS ENUM ('entrada', 'saida');
CREATE TYPE public.transaction_category AS ENUM ('venda', 'fornecedor', 'taxa_importacao', 'frete', 'aluguel', 'marketing', 'outros');
CREATE TYPE public.import_status AS ENUM ('comprado', 'enviado', 'em_transito', 'chegou_brasil', 'aguardando_taxa', 'saiu_entrega', 'entregue', 'cancelado');
CREATE TYPE public.campaign_status AS ENUM ('rascunho', 'enviada');
CREATE TYPE public.product_size AS ENUM ('P', 'M', 'G', 'GG', 'XGG');

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ STORES ============
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  segment TEXT,
  logo_url TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'admin',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_store ON public.profiles(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ HELPER: current_store_id (SECURITY DEFINER avoids RLS recursion) ============
CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = _role);
$$;

-- Profiles policies
CREATE POLICY "Profiles visíveis na mesma loja" ON public.profiles
  FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "Usuário atualiza próprio perfil" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admin gerencia perfis da loja" ON public.profiles
  FOR ALL TO authenticated
  USING (store_id = public.current_store_id() AND public.has_role('admin'))
  WITH CHECK (store_id = public.current_store_id() AND public.has_role('admin'));

-- Stores policies (após current_store_id)
CREATE POLICY "Ver própria loja" ON public.stores
  FOR SELECT TO authenticated USING (id = public.current_store_id());
CREATE POLICY "Admin atualiza própria loja" ON public.stores
  FOR UPDATE TO authenticated USING (id = public.current_store_id() AND public.has_role('admin'))
  WITH CHECK (id = public.current_store_id() AND public.has_role('admin'));

-- ============ TRIGGER: criar loja + perfil ao registrar usuário ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_store_id UUID;
  store_name TEXT;
  user_name TEXT;
BEGIN
  store_name := COALESCE(NEW.raw_user_meta_data->>'store_name', 'Minha Loja');
  user_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  INSERT INTO public.stores (name, segment)
  VALUES (store_name, COALESCE(NEW.raw_user_meta_data->>'segment', 'Camisas'))
  RETURNING id INTO new_store_id;

  INSERT INTO public.profiles (id, store_id, name, email, role)
  VALUES (NEW.id, new_store_id, user_name, NEW.email, 'admin');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ HELPER MACRO para política padrão por loja ============
-- Usado inline para cada tabela.

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  team TEXT,
  season TEXT,
  supplier TEXT,
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  min_stock INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_store ON public.products(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Produtos da loja" ON public.products FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

-- ============ PRODUCT_SIZES ============
CREATE TABLE public.product_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size public.product_size NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  UNIQUE(product_id, size)
);
CREATE INDEX idx_product_sizes_product ON public.product_sizes(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_sizes TO authenticated;
GRANT ALL ON public.product_sizes TO service_role;
ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tamanhos da loja" ON public.product_sizes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.store_id = public.current_store_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.store_id = public.current_store_id()));

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  instagram TEXT,
  city TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_store ON public.customers(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Clientes da loja" ON public.customers FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

-- ============ LEADS ============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  interest TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  last_contact TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_store ON public.leads(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Leads da loja" ON public.leads FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

-- ============ SALES ============
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name_snapshot TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  profit NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'pix',
  status public.sale_status NOT NULL DEFAULT 'concluida',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_store ON public.sales(store_id);
CREATE INDEX idx_sales_created ON public.sales(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Vendas da loja" ON public.sales FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

-- ============ SALE_ITEMS ============
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT,
  size public.product_size NOT NULL,
  quantity INT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Itens de venda da loja" ON public.sale_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.store_id = public.current_store_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.store_id = public.current_store_id()));

-- ============ TRIGGER: baixar estoque quando venda concluída ============
CREATE OR REPLACE FUNCTION public.decrement_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.product_sizes
    SET quantity = GREATEST(quantity - NEW.quantity, 0)
    WHERE product_id = NEW.product_id AND size = NEW.size;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_stock
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.decrement_stock_on_sale();

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'pendente',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_store ON public.orders(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Pedidos da loja" ON public.orders FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  size public.product_size NOT NULL,
  quantity INT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Itens de pedido da loja" ON public.order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.store_id = public.current_store_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.store_id = public.current_store_id()));

-- ============ TRANSACTIONS ============
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  description TEXT NOT NULL,
  category public.transaction_category NOT NULL DEFAULT 'outros',
  value NUMERIC(10,2) NOT NULL,
  payment_method public.payment_method,
  due_date DATE,
  paid BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_store ON public.transactions(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Financeiro da loja" ON public.transactions FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

-- ============ TRIGGER: criar transação automática ao concluir venda ============
CREATE OR REPLACE FUNCTION public.create_transaction_for_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluida' THEN
    INSERT INTO public.transactions (store_id, type, description, category, value, payment_method, paid)
    VALUES (NEW.store_id, 'entrada', 'Venda #' || substring(NEW.id::text, 1, 8), 'venda', NEW.total_value, NEW.payment_method, true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sale_transaction
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.create_transaction_for_sale();

-- ============ IMPORTS ============
CREATE TABLE public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tracking_code TEXT,
  supplier TEXT,
  status public.import_status NOT NULL DEFAULT 'comprado',
  expected_delivery DATE,
  customs_fee NUMERIC(10,2) DEFAULT 0,
  total_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_imports_store ON public.imports(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER imports_updated_at BEFORE UPDATE ON public.imports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Importações da loja" ON public.imports FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

CREATE TABLE public.import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity INT NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_items TO authenticated;
GRANT ALL ON public.import_items TO service_role;
ALTER TABLE public.import_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Itens de importação da loja" ON public.import_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.imports i WHERE i.id = import_id AND i.store_id = public.current_store_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.imports i WHERE i.id = import_id AND i.store_id = public.current_store_id()));

-- ============ CAMPAIGNS ============
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message TEXT,
  segment_filter JSONB,
  recipient_count INT NOT NULL DEFAULT 0,
  status public.campaign_status NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_store ON public.campaigns(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Campanhas da loja" ON public.campaigns FOR ALL TO authenticated
  USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());
