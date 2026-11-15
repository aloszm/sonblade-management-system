-- Productos reales de Gallo 4:20 (lista del dueño, 15 de noviembre de 2026). Solo base de desarrollo.
-- Mismo criterio que el catálogo de servicios: los productos de demostración no se borran, quedan como "(prueba)".
-- Comisión: no se crea ninguna regla. Sin regla por producto, la base aplica la tasa general del negocio
-- (businesses.product_commission_pct, hoy 20 % de lo cobrado), que es la que pidió el dueño.
-- Existencias iniciales: el dueño confirmó que empiezan en 0. Se crea su renglón de inventario en 0, igual que
-- create_catalog_product con existencia 0 (sin movimiento 'initial', porque no entra mercancía); la primera
-- entrada se captura como ajuste de inventario, que deja su movimiento y su bitácora.
do $do$
declare
  v_business uuid;
begin
  select id into v_business from public.businesses where slug = 'gallo-420';
  if v_business is null then
    raise notice 'No existe el negocio gallo-420; no se cargan los productos.';
    return;
  end if;

  update public.products set name = name || ' (prueba)', updated_at = now()
  where business_id = v_business
    and name in ('Cera modeladora', 'Shampoo', 'Pomada mate', 'Aceite para barba', 'Cera E2E');

  insert into public.products (business_id, name, sale_price, cost_price, tracks_inventory, is_active)
  select v_business, p.name, p.price, p.cost, true, true
  from (values
    ('Pomada Negra Baregk (150 ml)', 180, 45),
    ('Pomada Roja Baregk (150 ml)', 180, 45),
    ('Peine de textura', 80, 27),
    ('Polvo de textura', 225, 115)
  ) as p(name, price, cost)
  where not exists (select 1 from public.products x where x.business_id = v_business and x.name = p.name);

  insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity)
  select v_business, br.id, pr.id, 0, 0
  from public.products pr join public.branches br on br.business_id = pr.business_id
  where pr.business_id = v_business
    and pr.name in ('Pomada Negra Baregk (150 ml)', 'Pomada Roja Baregk (150 ml)', 'Peine de textura', 'Polvo de textura')
    and not exists (select 1 from public.branch_inventory bi where bi.branch_id = br.id and bi.product_id = pr.id);
end
$do$;
