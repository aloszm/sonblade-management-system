-- El resultado financiero del reporte usa el costo guardado en cada venta (sale_items.unit_cost_snapshot)
-- y solo recurre al costo actual del catálogo si el renglón no lo trae. Así, cambiar el costo de un
-- producto no altera la utilidad de periodos pasados. Se marca product_cost.source = 'sale'.
do $do$
declare
  v_def text := pg_get_functiondef('private.report_financial_period(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)'::regprocedure);
  v_old_cost constant text := 'case when si.item_type = ''product'' then pr.cost_price end as unit_cost';
  v_new_cost constant text := 'case when si.item_type = ''product'' then coalesce(si.unit_cost_snapshot, pr.cost_price) end as unit_cost';
  v_old_src constant text := '''source'', ''catalog''';
  v_new_src constant text := '''source'', ''sale''';
begin
  if (length(v_def) - length(replace(v_def, v_old_cost, ''))) / length(v_old_cost) <> 1 then
    raise exception 'El fragmento del costo unitario no aparece exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_old_src, ''))) / length(v_old_src) <> 1 then
    raise exception 'El fragmento de la fuente del costo no aparece exactamente una vez.';
  end if;
  execute replace(replace(v_def, v_old_cost, v_new_cost), v_old_src, v_new_src);
end
$do$;
