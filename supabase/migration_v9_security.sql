-- ======================================================
-- MIGRATION V9 - Security Hardening
-- ======================================================

-- A. Ampliar columna PIN de clientes para bcrypt hash (60 chars mínimo)
ALTER TABLE clients ALTER COLUMN pin TYPE TEXT;

-- B. RPC: decrementar stock de forma atómica (evita race condition)
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_qty INT)
RETURNS INT AS $$
DECLARE new_stock INT;
BEGIN
  UPDATE products
  SET stock = GREATEST(0, stock - p_qty)
  WHERE id = p_product_id
  RETURNING stock INTO new_stock;
  RETURN COALESCE(new_stock, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. RPC: incrementar stock (para reversión de venta eliminada)
CREATE OR REPLACE FUNCTION increment_stock(p_product_id UUID, p_qty INT)
RETURNS INT AS $$
DECLARE new_stock INT;
BEGIN
  UPDATE products
  SET stock = stock + p_qty
  WHERE id = p_product_id
  RETURNING stock INTO new_stock;
  RETURN COALESCE(new_stock, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. RPC: sumar puntos y registrar visita de cliente de forma atómica
CREATE OR REPLACE FUNCTION add_client_visit(p_client_id UUID, p_points INT)
RETURNS VOID AS $$
BEGIN
  UPDATE clients
  SET points        = points + p_points,
      visits        = visits + 1,
      last_visit_at = now()
  WHERE id = p_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
