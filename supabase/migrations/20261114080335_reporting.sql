-- Reportes: ingresos, cortes por barbero, comisiones, formas de pago, graficas y stock bajo.
-- Toda la logica vive en la base; las rutas de la API solo la llaman.
-- La "semana" usa el mismo corte que la liquidacion: sabado 8:00 pm a sabado 8:00 pm.

-- 1) Ventana de tiempo de cada periodo, en la zona horaria del negocio
CREATE OR REPLACE FUNCTION private.report_window(p_business_id uuid, p_period text)
RETURNS TABLE (start_ts timestamptz, end_ts timestamptz)
LANGUAGE plpgsql STABLE SET search_path = ''
AS $fn$
DECLARE
  v_tz text;
  v_local_now timestamp;
  v_start timestamp;
  v_end timestamp;
  v_last_saturday date;
BEGIN
  SELECT b.timezone INTO v_tz FROM public.businesses b WHERE b.id = p_business_id;
  v_local_now := now() AT TIME ZONE v_tz;
  IF p_period = 'today' THEN
    v_start := date_trunc('day', v_local_now);
    v_end := v_start + interval '1 day';
  ELSIF p_period = 'month' THEN
    v_start := date_trunc('month', v_local_now);
    v_end := v_start + interval '1 month';
  ELSIF p_period IN ('week', 'last_week') THEN
    v_last_saturday := v_local_now::date - ((extract(dow from v_local_now)::int + 1) % 7);
    v_start := v_last_saturday + time '20:00';
    IF v_local_now < v_start THEN v_start := v_start - interval '7 days'; END IF;
    IF p_period = 'last_week' THEN v_start := v_start - interval '7 days'; END IF;
    v_end := v_start + interval '7 days';
  ELSE
    RAISE EXCEPTION 'Unknown report period' USING ERRCODE = '22023';
  END IF;
  start_ts := v_start AT TIME ZONE v_tz;
  end_ts := v_end AT TIME ZONE v_tz;
  RETURN NEXT;
END $fn$;
REVOKE ALL ON FUNCTION private.report_window(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.report_window(uuid, text) TO authenticated;

-- 2) Reporte del negocio (dueño/admin) o de un barbero (solo el propio)
CREATE OR REPLACE FUNCTION private.business_report_impl(
  p_branch_id uuid, p_period text, p_employee_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_business_id uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Report request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id, bs.timezone INTO v_business_id, v_tz
  FROM public.branches b JOIN public.businesses bs ON bs.id = b.business_id
  WHERE b.id = p_branch_id AND b.is_active;
  IF v_business_id IS NULL OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Report permission denied' USING ERRCODE = '42501';
  END IF;
  v_is_admin := private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[]);
  IF NOT v_is_admin AND (p_employee_id IS NULL OR NOT private.owns_employee(v_business_id, p_employee_id)) THEN
    RAISE EXCEPTION 'Report permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_from IS NOT NULL AND p_to IS NOT NULL THEN
    v_start := p_from; v_end := p_to;
  ELSE
    SELECT w.start_ts, w.end_ts INTO v_start, v_end FROM private.report_window(v_business_id, p_period) w;
  END IF;
  IF v_end <= v_start OR v_end - v_start > interval '400 days' THEN
    RAISE EXCEPTION 'Report range is invalid' USING ERRCODE = '22023';
  END IF;

  WITH
  paid_sales AS (
    SELECT s.id, s.paid_at, s.total_amount FROM public.sales s
    WHERE s.business_id = v_business_id AND s.branch_id = p_branch_id AND s.status = 'paid'
      AND s.paid_at >= v_start AND s.paid_at < v_end
  ),
  pays AS (
    SELECT p.sale_id, p.method, p.amount, p.processed_at FROM public.payments p
    WHERE p.business_id = v_business_id AND p.branch_id = p_branch_id AND p.status = 'confirmed'
      AND p.processed_at >= v_start AND p.processed_at < v_end
  ),
  items AS (
    SELECT si.id, si.sale_id, si.item_type, si.item_name_snapshot AS item_name, si.quantity, si.line_total,
           si.employee_id, si.commission_employee_id, ps.paid_at
    FROM public.sale_items si JOIN paid_sales ps ON ps.id = si.sale_id
  ),
  comm AS (
    SELECT ce.employee_id, ce.commission_amount, si.item_type
    FROM public.commission_entries ce JOIN public.sale_items si ON si.id = ce.sale_item_id
    WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.status = 'generated'
      AND ce.generated_at >= v_start AND ce.generated_at < v_end
  ),
  emp AS (
    SELECT e.id, e.display_name FROM public.employees e
    WHERE e.business_id = v_business_id AND e.is_active AND (p_employee_id IS NULL OR e.id = p_employee_id)
  ),
  barber_rows AS (
    SELECT e.id, e.display_name AS name,
      COALESCE((SELECT sum(i.quantity) FROM items i WHERE i.item_type = 'service' AND i.employee_id = e.id), 0) AS cuts,
      COALESCE((SELECT sum(i.line_total) FROM items i WHERE i.item_type = 'service' AND i.employee_id = e.id), 0) AS service_revenue,
      COALESCE((SELECT sum(i.line_total) FROM items i WHERE i.item_type = 'product' AND i.commission_employee_id = e.id), 0) AS product_revenue,
      COALESCE((SELECT sum(c.commission_amount) FROM comm c WHERE c.employee_id = e.id AND c.item_type = 'service'), 0) AS service_commission,
      COALESCE((SELECT sum(c.commission_amount) FROM comm c WHERE c.employee_id = e.id AND c.item_type = 'product'), 0) AS product_commission,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'count', x.cnt, 'revenue', x.rev) ORDER BY x.cnt DESC, x.name)
                FROM (SELECT i.item_name AS name, sum(i.quantity) AS cnt, sum(i.line_total) AS rev
                      FROM items i WHERE i.item_type = 'service' AND i.employee_id = e.id GROUP BY i.item_name) x), '[]'::jsonb) AS service_breakdown
    FROM emp e
  )
  SELECT jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end, 'timezone', v_tz),
    'kpis', CASE WHEN v_is_admin AND p_employee_id IS NULL THEN jsonb_build_object(
        'total_revenue', COALESCE((SELECT sum(amount) FROM pays), 0),
        'total_sales', (SELECT count(*) FROM paid_sales),
        'avg_ticket', COALESCE(round((SELECT sum(total_amount) FROM paid_sales) / NULLIF((SELECT count(*) FROM paid_sales), 0), 2), 0),
        'total_commissions', COALESCE((SELECT sum(commission_amount) FROM comm), 0),
        'expenses', COALESCE((SELECT sum(x.amount) FROM public.expenses x
                              WHERE x.business_id = v_business_id AND x.branch_id = p_branch_id AND x.status = 'posted'
                                AND x.incurred_at >= v_start AND x.incurred_at < v_end), 0),
        'cuts', COALESCE((SELECT sum(quantity) FROM items WHERE item_type = 'service'), 0)) END,
    'payment_breakdown', jsonb_build_object(
        'cash', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'cash'), 0),
        'card', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'card'), 0),
        'transfer', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'transfer'), 0),
        'other', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'other'), 0)),
    'barbers', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY (b.service_revenue + b.product_revenue) DESC, b.name) FROM barber_rows b), '[]'::jsonb),
    'service_breakdown', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'count', x.cnt, 'revenue', x.rev) ORDER BY x.cnt DESC, x.name)
        FROM (SELECT i.item_name AS name, sum(i.quantity) AS cnt, sum(i.line_total) AS rev FROM items i
              WHERE i.item_type = 'service' AND (p_employee_id IS NULL OR i.employee_id = p_employee_id) GROUP BY i.item_name) x), '[]'::jsonb),
    'hourly', COALESCE((SELECT jsonb_agg(jsonb_build_object('hour', h.h || ':00', 'revenue', COALESCE(q.r, 0)) ORDER BY h.h)
        FROM generate_series(8, 21) AS h(h)
        LEFT JOIN (SELECT extract(hour from processed_at AT TIME ZONE v_tz)::int AS hr, sum(amount) AS r FROM pays GROUP BY 1) q ON q.hr = h.h), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', to_char(d.d, 'DD/MM'), 'revenue', d.r) ORDER BY d.d)
        FROM (SELECT (processed_at AT TIME ZONE v_tz)::date AS d, sum(amount) AS r FROM pays GROUP BY 1) d), '[]'::jsonb),
    'weekly', COALESCE((SELECT jsonb_agg(jsonb_build_object('week', 'Semana ' || w.n, 'revenue', w.r) ORDER BY w.n)
        FROM (SELECT (floor(((processed_at AT TIME ZONE v_tz)::date - (v_start AT TIME ZONE v_tz)::date) / 7.0) + 1)::int AS n, sum(amount) AS r
              FROM pays GROUP BY 1) w), '[]'::jsonb),
    'low_stock', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'stock', l.stock, 'min_stock', l.min_stock) ORDER BY l.stock, l.name)
        FROM (SELECT p.id, p.name, bi.quantity_on_hand AS stock, bi.minimum_quantity AS min_stock
              FROM public.branch_inventory bi JOIN public.products p ON p.business_id = bi.business_id AND p.id = bi.product_id
              WHERE bi.business_id = v_business_id AND bi.branch_id = p_branch_id AND p.is_active
                AND bi.minimum_quantity > 0 AND bi.quantity_on_hand <= bi.minimum_quantity
              ORDER BY bi.quantity_on_hand, p.name LIMIT 5) l), '[]'::jsonb),
    'sales', CASE WHEN p_employee_id IS NOT NULL THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', t.sale_id, 'created_at', t.paid_at, 'items', t.items, 'amount', t.amount, 'methods', t.methods) ORDER BY t.paid_at DESC)
        FROM (SELECT i.sale_id, min(i.paid_at) AS paid_at,
                     string_agg(i.item_name, ', ' ORDER BY i.item_name) AS items, sum(i.line_total) AS amount,
                     (SELECT string_agg(DISTINCT pp.method::text, ', ') FROM pays pp WHERE pp.sale_id = i.sale_id) AS methods
              FROM items i
              WHERE (i.item_type = 'service' AND i.employee_id = p_employee_id)
                 OR (i.item_type = 'product' AND i.commission_employee_id = p_employee_id)
              GROUP BY i.sale_id) t), '[]'::jsonb) END
  ) INTO v_result;
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION private.business_report_impl(uuid, text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.business_report_impl(uuid, text, uuid, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.business_report(
  p_branch_id uuid, p_period text, p_employee_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.business_report_impl($1, $2, $3, $4, $5) $fn$;
REVOKE ALL ON FUNCTION public.business_report(uuid, text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_report(uuid, text, uuid, timestamptz, timestamptz) TO authenticated;
