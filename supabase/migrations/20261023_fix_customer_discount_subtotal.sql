-- Fix customer discount calculation when subtotal_before_discount is zero.
-- Recover the product subtotal from order items before applying the discount.
CREATE OR REPLACE FUNCTION public.vineyard_assign_order_customer(
  p_order_id uuid,
  p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_order public.vineyard_orders%rowtype;
  v_customer public.vineyard_customers%rowtype;
  v_items_subtotal numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_delivery_fee numeric := 0;
begin
  if public.vineyard_current_employee_id() is null or not public.vineyard_has_permission('orders_manage') then
    raise exception 'Keine Berechtigung für Bestellungen.';
  end if;

  select * into v_order from public.vineyard_orders where id = p_order_id for update;
  if not found then raise exception 'Bestellung nicht gefunden.'; end if;
  if v_order.status not in ('In Bearbeitung','Eingegangen') then
    raise exception 'Der Kunde kann nur bei offenen Bestellungen zugeordnet werden.';
  end if;

  if p_customer_id is not null then
    select * into v_customer from public.vineyard_customers where id = p_customer_id and active = true;
    if not found then raise exception 'Der ausgewählte Kunde ist nicht aktiv oder existiert nicht.'; end if;
    v_discount := greatest(0, least(100, coalesce(v_customer.discount_percent,0)));
  end if;

  select coalesce(sum(round(oi.quantity * oi.unit_price, 2)), 0)
    into v_items_subtotal
    from public.vineyard_order_items oi
   where oi.order_id = p_order_id;

  -- A zero or missing stored subtotal is not a valid product subtotal; recover it from order lines.
  v_subtotal := case
    when coalesce(v_order.subtotal_before_discount, 0) > 0 then v_order.subtotal_before_discount
    when v_items_subtotal > 0 then v_items_subtotal
    else greatest(0, coalesce(v_order.total,0) - coalesce(v_order.delivery_fee,0))
  end;
  v_subtotal := greatest(0, round(v_subtotal,2));
  v_delivery_fee := greatest(0, round(coalesce(v_order.delivery_fee,0),2));
  v_total := round(v_subtotal * (1 - v_discount / 100),2) + v_delivery_fee;
  v_total := round(v_total,2);

  update public.vineyard_orders
  set customer_id = p_customer_id,
      subtotal_before_discount = v_subtotal,
      customer_discount_percent = v_discount,
      total = v_total,
      updated_at = now()
  where id = p_order_id;

  insert into public.vineyard_audit_log(actor_id,action,entity,entity_id,details)
  values(public.vineyard_current_employee_id(),'Bestellung Kunde zugeordnet','order',p_order_id::text,
    jsonb_build_object('order_number',v_order.order_number,'customer_id',p_customer_id,
      'customer_name',case when p_customer_id is null then 'Privatkunde' else v_customer.name end,
      'discount_percent',v_discount,'subtotal_before_discount',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total));

  return (select to_jsonb(o) from public.vineyard_orders o where o.id=p_order_id);
end;
$function$;

-- Keep the RPC callable by the app roles; authorization is enforced inside the function.
GRANT EXECUTE ON FUNCTION public.vineyard_assign_order_customer(uuid, uuid) TO anon, authenticated;
