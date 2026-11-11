-- مقياس — الضريبة اختيارية
-- تُحتسب ضريبة القيمة المضافة (15% ضمن السعر) فقط إذا أُدخل رقم ضريبي في إعدادات المنشأة.
-- بدون رقم ضريبي: vat_amount = 0 وتصدر «فاتورة» عادية.

create or replace function public.submit_payment(p_kind public.payment_kind, p_ref uuid, p_coupon text, p_receipt_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q      jsonb;
  v_id   uuid;
  v_tot  numeric;
  v_vat  boolean;
begin
  if p_receipt_path is null or split_part(p_receipt_path, '/', 1) <> auth.uid()::text then
    raise exception 'invalid receipt' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where user_id = auth.uid() and status = 'pending_review'
             and ((p_kind = 'course' and course_id = p_ref) or (p_kind = 'request' and request_id = p_ref))) then
    raise exception 'already submitted' using errcode = 'P0001';
  end if;

  q := public.quote_payment(p_kind, p_ref, p_coupon);
  if q ->> 'coupon_error' is not null then raise exception 'coupon %', q ->> 'coupon_error' using errcode = 'P0001'; end if;
  v_tot := (q ->> 'total')::numeric;
  v_vat := coalesce((select trim(value) <> '' from public.site_settings where key = 'vat_number'), false);

  insert into public.payments (user_id, kind, course_id, request_id, description, list_price, coupon_code, discount, total, vat_amount, receipt_path)
  values (auth.uid(), p_kind,
          case when p_kind = 'course' then p_ref end,
          case when p_kind = 'request' then p_ref end,
          q ->> 'description', (q ->> 'list_price')::numeric,
          case when (q ->> 'percent_off')::int > 0 then upper(trim(p_coupon)) end,
          (q ->> 'discount')::numeric, v_tot,
          case when v_vat then round(v_tot - v_tot / 1.15, 2) else 0 end,
          p_receipt_path)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.submit_payment(public.payment_kind, uuid, text, text) from public, anon;
