-- Lexbnb phase109 — anlik goruntulerde vergi dusumunu geri getir (27.10.2026).
--
-- phase92 (rezervasyon finansi) iki sunucu raporunu yamamisti: oda ve
-- temizlik geliri, rezervasyonun financial_details'indeki vergiden
-- (result.taxTotal, result.cleaningTax) arindirilarak hesaplaniyordu.
-- phase97 (gelir defteri, 19.10.2026) bu iki fonksiyonu phase92'den ONCEKI
-- govdeden yeniden tanimladi ve yamayi sildi. O gunden beri vergi profili
-- kullanilan rezervasyonda ay kapanisi ve ana sayfa cirosu vergiyi de ciro
-- sayiyordu (test projesinde olculdu: oda geliri 11.200 yerine 12.544).
-- booking_finance_live_tests bunu yakaladi.
--
-- Duzeltme phase92'nin yaptigiyla ayni: guncel govdede yalniz gelir
-- izdusumu degisir; rol, kapasite ve diger gelir mantigina dokunulmaz.
-- Tekrar kosulursa yama zaten var demektir ve bir sey yapilmaz.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 97) THEN
        RAISE EXCEPTION 'PHASE109_REQUIRES_PHASE97';
    END IF;
END
$pre$;

DO $reports$
DECLARE
    v_imza TEXT;
    v_govde TEXT;
BEGIN
    FOREACH v_imza IN ARRAY ARRAY['public.compute_month_close_snapshot(uuid,integer,integer)',
                                  'public.get_executive_dashboard_snapshot(uuid,text,uuid)'] LOOP
        v_govde := pg_get_functiondef(v_imza::regprocedure);
        IF strpos(v_govde, 'result,taxTotal') > 0 THEN
            CONTINUE;
        END IF;
        IF (length(v_govde) - length(replace(v_govde, 'b.gross_amount, b.cleaning_fee', ''))) / length('b.gross_amount, b.cleaning_fee') <> 1 THEN
            RAISE EXCEPTION 'PHASE109_REPORT_PROJECTION_CHANGED: %', v_imza;
        END IF;
        v_govde := replace(v_govde, 'b.gross_amount, b.cleaning_fee',
            '(b.gross_amount - COALESCE((b.financial_details #>> ''{result,taxTotal}'')::numeric,0)) AS gross_amount, (b.cleaning_fee - COALESCE((b.financial_details #>> ''{result,cleaningTax}'')::numeric,0)) AS cleaning_fee');
        EXECUTE v_govde;
    END LOOP;
END
$reports$;

DO $verify$
DECLARE
    v_imza TEXT;
BEGIN
    FOREACH v_imza IN ARRAY ARRAY['public.compute_month_close_snapshot(uuid,integer,integer)',
                                  'public.get_executive_dashboard_snapshot(uuid,text,uuid)'] LOOP
        IF strpos(pg_get_functiondef(v_imza::regprocedure), 'result,taxTotal') = 0
           OR strpos(pg_get_functiondef(v_imza::regprocedure), 'result,cleaningTax') = 0 THEN
            RAISE EXCEPTION 'PHASE109_TAX_PROJECTION_MISSING %', v_imza;
        END IF;
        IF has_function_privilege('anon', v_imza, 'EXECUTE') THEN
            RAISE EXCEPTION 'PHASE109_ANON_FUNCTION_PRIVILEGE %', v_imza;
        END IF;
    END LOOP;
    RAISE NOTICE 'PHASE 109 OK — anlik goruntulerde vergi dusumu.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (109, 'phase109_snapshot_tax_reapply')
ON CONFLICT (version) DO NOTHING;

COMMIT;
