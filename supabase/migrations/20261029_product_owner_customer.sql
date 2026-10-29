alter table public.vineyard_inventory
  add column if not exists owner_customer_id uuid null
  references public.vineyard_customers(id) on delete set null;

create index if not exists vineyard_inventory_owner_customer_id_idx
  on public.vineyard_inventory(owner_customer_id);
