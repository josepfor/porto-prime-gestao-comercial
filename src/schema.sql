CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('Administrador','Gerente','Vendedor','Caixa','Estoquista')),active BOOLEAN DEFAULT TRUE,force_change_password BOOLEAN DEFAULT FALSE,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY,code TEXT UNIQUE NOT NULL,ean TEXT, name TEXT NOT NULL,brand TEXT,category TEXT,unit TEXT DEFAULT 'UN',location TEXT,stock NUMERIC(14,3) DEFAULT 0,min_stock NUMERIC(14,3) DEFAULT 0,max_stock NUMERIC(14,3) DEFAULT 0,cost NUMERIC(14,2) DEFAULT 0,retail NUMERIC(14,2) DEFAULT 0,wholesale NUMERIC(14,2) DEFAULT 0,wholesale_min NUMERIC(14,3) DEFAULT 0,promo NUMERIC(14,2) DEFAULT 0,promo_start DATE,promo_end DATE,active BOOLEAN DEFAULT TRUE,updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS customers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,doc TEXT,phone TEXT,email TEXT,address TEXT,type TEXT DEFAULT 'Consumidor',credit_limit NUMERIC(14,2) DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS suppliers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,doc TEXT,contact TEXT,phone TEXT,email TEXT,address TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS cash_sessions(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id),opened_at TIMESTAMPTZ DEFAULT now(),closed_at TIMESTAMPTZ,opening_amount NUMERIC(14,2) DEFAULT 0,expected_amount NUMERIC(14,2),counted_amount NUMERIC(14,2),status TEXT DEFAULT 'OPEN');
CREATE TABLE IF NOT EXISTS cash_movements(id SERIAL PRIMARY KEY,session_id INT REFERENCES cash_sessions(id),user_id INT REFERENCES users(id),kind TEXT NOT NULL,description TEXT,amount NUMERIC(14,2) NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS sales(id SERIAL PRIMARY KEY,customer_id INT REFERENCES customers(id),user_id INT REFERENCES users(id),cash_session_id INT REFERENCES cash_sessions(id),status TEXT DEFAULT 'FINALIZADA',payment_method TEXT,total NUMERIC(14,2) NOT NULL,discount NUMERIC(14,2) DEFAULT 0,cmv NUMERIC(14,2) DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS sale_items(id SERIAL PRIMARY KEY,sale_id INT REFERENCES sales(id) ON DELETE CASCADE,product_id INT REFERENCES products(id),description TEXT,qty NUMERIC(14,3) NOT NULL,unit_price NUMERIC(14,2) NOT NULL,cost NUMERIC(14,2) NOT NULL,price_type TEXT);
CREATE TABLE IF NOT EXISTS stock_movements(id SERIAL PRIMARY KEY,product_id INT REFERENCES products(id),user_id INT REFERENCES users(id),kind TEXT NOT NULL,qty NUMERIC(14,3) NOT NULL,balance_before NUMERIC(14,3),balance_after NUMERIC(14,3),reference_type TEXT,reference_id INT,note TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS purchases(id SERIAL PRIMARY KEY,supplier_id INT REFERENCES suppliers(id),user_id INT REFERENCES users(id),status TEXT DEFAULT 'RECEBIDA',total NUMERIC(14,2) DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS purchase_items(id SERIAL PRIMARY KEY,purchase_id INT REFERENCES purchases(id) ON DELETE CASCADE,product_id INT REFERENCES products(id),qty NUMERIC(14,3) NOT NULL,unit_cost NUMERIC(14,2) NOT NULL);
CREATE TABLE IF NOT EXISTS financial_entries(id SERIAL PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('PAGAR','RECEBER','DESPESA')),description TEXT NOT NULL,category TEXT,amount NUMERIC(14,2) NOT NULL,due_date DATE,status TEXT DEFAULT 'PENDENTE',paid_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,user_id INT REFERENCES users(id),action TEXT NOT NULL,detail TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name); CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id); CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS reference_id INT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS installment_no INT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS installment_count INT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS party_name TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS document_no TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by INT REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
CREATE TABLE IF NOT EXISTS quotes(id SERIAL PRIMARY KEY,customer_id INT REFERENCES customers(id),user_id INT REFERENCES users(id),status TEXT DEFAULT 'ABERTO',valid_until DATE,discount NUMERIC(14,2) DEFAULT 0,total NUMERIC(14,2) DEFAULT 0,notes TEXT,created_at TIMESTAMPTZ DEFAULT now(),converted_sale_id INT REFERENCES sales(id));
CREATE TABLE IF NOT EXISTS quote_items(id SERIAL PRIMARY KEY,quote_id INT REFERENCES quotes(id) ON DELETE CASCADE,product_id INT REFERENCES products(id),description TEXT,qty NUMERIC(14,3) NOT NULL,unit_price NUMERIC(14,2) NOT NULL,discount_percent NUMERIC(8,2) DEFAULT 0);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(8,2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_fin_due ON financial_entries(due_date,status);
CREATE INDEX IF NOT EXISTS idx_purchase_created ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);

-- v4.2
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INT REFERENCES suppliers(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_id INT REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(8,3) DEFAULT 0;
CREATE TABLE IF NOT EXISTS sale_payments(id SERIAL PRIMARY KEY,sale_id INT REFERENCES sales(id) ON DELETE CASCADE,method TEXT NOT NULL,amount NUMERIC(14,2) NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS inventory_counts(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id),status TEXT DEFAULT 'ABERTO',notes TEXT,created_at TIMESTAMPTZ DEFAULT now(),finished_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS inventory_count_items(id SERIAL PRIMARY KEY,count_id INT REFERENCES inventory_counts(id) ON DELETE CASCADE,product_id INT REFERENCES products(id),system_qty NUMERIC(14,3) NOT NULL,counted_qty NUMERIC(14,3),difference NUMERIC(14,3));
CREATE INDEX IF NOT EXISTS idx_products_code_lower ON products(lower(code));
CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

-- ConstruGest 2.1 - Configuracoes
CREATE TABLE IF NOT EXISTS app_settings(id INT PRIMARY KEY DEFAULT 1 CHECK(id=1), data JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ DEFAULT now());
INSERT INTO app_settings(id,data) VALUES(1,'{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- ConstruGest 2.5 - Controle, Permissoes e Seguranca
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;


-- ConstruGest 2.7.1 - PDV Avancado
CREATE TABLE IF NOT EXISTS suspended_sales(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id),customer_id INT REFERENCES customers(id),label TEXT,payload JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_suspended_sales_created ON suspended_sales(created_at);


-- ConstruGest 3.0 - Caixa e Fechamento Profissional
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closed_by INT REFERENCES users(id);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS difference NUMERIC(14,2);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS close_note TEXT;
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened ON cash_sessions(opened_at);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);

-- Porto Prime 4.1.2 - índices de desempenho para operação e relatórios
CREATE INDEX IF NOT EXISTS idx_users_email_lower_active ON users(lower(email),active);
CREATE INDEX IF NOT EXISTS idx_products_active_name ON products(active,name);
CREATE INDEX IF NOT EXISTS idx_products_active_stock ON products(active,stock,min_stock);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_doc ON customers(doc);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_sales_status_created ON sales(status,created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id,id);
CREATE INDEX IF NOT EXISTS idx_sales_cash_session ON sales(cash_session_id,status);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id,sale_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id,purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id,id);
CREATE INDEX IF NOT EXISTS idx_stock_product_created ON stock_movements(product_id,created_at);
CREATE INDEX IF NOT EXISTS idx_fin_status_kind_due ON financial_entries(status,kind,due_date);
CREATE INDEX IF NOT EXISTS idx_fin_reference ON financial_entries(reference_type,reference_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- 4.1.4: sequência persistente dos códigos automáticos, sem alterar produtos existentes.
CREATE TABLE IF NOT EXISTS product_code_counter(id INTEGER PRIMARY KEY CHECK(id=1),last_value NUMERIC NOT NULL DEFAULT 0);
INSERT INTO product_code_counter(id,last_value) VALUES(1,0) ON CONFLICT(id) DO NOTHING;


-- Porto Prime 4.2.0 - estabilização profissional
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_change_password BOOLEAN DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,description TEXT NOT NULL,applied_at TIMESTAMPTZ DEFAULT now());
INSERT INTO schema_migrations(version,description) VALUES(420,'Porto Prime 4.2.0 - segurança, estabilidade e auditoria') ON CONFLICT(version) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_fin_created ON financial_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_user_created ON sales(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_status_created ON purchases(status,created_at);


-- Porto Prime 4.4.0 - Metas e comissões de vendedores
CREATE TABLE IF NOT EXISTS seller_targets(
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL CHECK(month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  target_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(target_amount>=0),
  commission_percent NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK(commission_percent>=0 AND commission_percent<=100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id,month_key)
);
CREATE INDEX IF NOT EXISTS idx_seller_targets_month ON seller_targets(month_key,user_id);
INSERT INTO schema_migrations(version,description) VALUES(440,'Porto Prime 4.4.0 - metas e comissões') ON CONFLICT(version) DO NOTHING;

-- Porto Prime 4.4.8 - idempotência de finalização de vendas (não altera registros existentes)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS request_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
INSERT INTO schema_migrations(version,description) VALUES(448,'Porto Prime 4.4.8 - idempotência e integridade de vendas') ON CONFLICT(version) DO NOTHING;

-- Porto Prime: imagem única por produto.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_data TEXT;
