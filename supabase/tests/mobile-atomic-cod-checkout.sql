begin;
do $test$
declare
 u uuid := gen_random_uuid(); a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
 k uuid := gen_random_uuid(); p text; j jsonb; one jsonb; two jsonb; stock integer; failed boolean := false;
begin
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 values (u,'mobile-audit-'||u::text||'@example.invalid','{"provider":"email","providers":["email"]}','{}');
 insert into public.addresses
 select (jsonb_populate_record(null::public.addresses,to_jsonb(x)||jsonb_build_object('id',a,'user_id',u,'province','Metro Manila','city','Quezon City','email','audit@example.invalid','mobile','+639170000000'))).* from public.addresses x limit 1;
 if not exists(select 1 from public.addresses where id=a) then raise exception 'No address fixture available'; end if;
 select id,stock_quantity into p,stock from public.products where status='active' and stock_quantity>2 and price between 1000 and 20000 order by price limit 1;
 if p is null then raise exception 'No suitable product fixture'; end if;
 j := jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1));
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 begin
  perform public.place_mobile_cod_order(a,j,k,gen_random_uuid());
 exception when others then
  if sqlerrm not like '%unavailable or expired%' then raise; end if;
  failed := true;
 end;
 if not failed or exists(select 1 from public.orders where user_id=u) then raise exception 'Reward failure did not roll back order'; end if;
 if (select stock_quantity from public.products where id=p)<>stock then raise exception 'Reward failure did not roll back stock'; end if;
 insert into public.mobile_loyalty_redemptions(id,user_id,points_cost,discount_amount) values(r,u,100,100);
 one:=public.place_mobile_cod_order(a,j,k,r);
 two:=public.place_mobile_cod_order(a,j,k,r);
 if one->>'id'<>two->>'id' then raise exception 'Retry duplicated order'; end if;
 if (select count(*) from public.orders where user_id=u)<>1 then raise exception 'Expected exactly one order'; end if;
 if (select stock_quantity from public.products where id=p)<>stock-1 then raise exception 'Stock reserved more than once'; end if;
 if (one->>'reward_discount')::numeric<>100 then raise exception 'Reward not applied'; end if;
 if not (select mobile_app_order from public.orders where id=(one->>'id')::uuid) then raise exception 'Order not attributed to mobile'; end if;
 failed:=false;
 begin perform public.place_mobile_cod_order(a,j,k,null);
 exception when others then
  if sqlerrm not like '%different order%' then raise; end if;
  failed:=true;
 end;
 if not failed then raise exception 'Changed intent reused key'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 failed:=false;
 begin perform public.place_mobile_cod_order(a,j,k,r);
 exception when others then
  if sqlerrm not like '%Authentication required%' then raise; end if;
  failed:=true;
 end;
 if not failed then raise exception 'Unauthenticated checkout accepted'; end if;
end $test$;
rollback;
select 'PASS: rollback, reward, idempotency, stock, attribution, changed-intent and missing-auth checks; fixtures rolled back' as result;
