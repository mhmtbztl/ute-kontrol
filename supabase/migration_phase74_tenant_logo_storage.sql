-- Lexbnb phase74 — isletme logosu Storage + L-118 property-media name fix.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 72) THEN
        RAISE EXCEPTION 'PHASE74_REQUIRES_PHASE72';
    END IF;
END
$pre$;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tenant-assets', 'tenant-assets', false, 2097152,
        ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'];

-- Yol: <tenant_uuid>/logo/<benzersiz-dosya>.<uzanti>
DROP POLICY IF EXISTS "Members read tenant logos" ON storage.objects;
CREATE POLICY "Members read tenant logos" ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(storage.objects.name))[2] = 'logo'
    AND public.is_tenant_member(public.marketing_storage_tenant_id(storage.objects.name))
);

DROP POLICY IF EXISTS "Managers upload tenant logos" ON storage.objects;
CREATE POLICY "Managers upload tenant logos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(storage.objects.name))[2] = 'logo'
    AND array_length(storage.foldername(storage.objects.name), 1) = 2
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
    AND COALESCE((metadata ->> 'size')::bigint, 0) <= 2097152
    AND metadata ->> 'mimetype' IN ('image/png','image/jpeg','image/webp','image/svg+xml')
);

DROP POLICY IF EXISTS "Managers update tenant logos" ON storage.objects;
CREATE POLICY "Managers update tenant logos" ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(storage.objects.name))[2] = 'logo'
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
)
WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(storage.objects.name))[2] = 'logo'
    AND array_length(storage.foldername(storage.objects.name), 1) = 2
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
    AND COALESCE((metadata ->> 'size')::bigint, 0) <= 2097152
    AND metadata ->> 'mimetype' IN ('image/png','image/jpeg','image/webp','image/svg+xml')
);

DROP POLICY IF EXISTS "Managers delete tenant logos" ON storage.objects;
CREATE POLICY "Managers delete tenant logos" ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(storage.objects.name))[2] = 'logo'
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
);

-- L-118: alt sorgudaki niteliksiz `name`, properties.name olarak cozuluyordu.
-- Hedef nesne adi her yerde acikca storage.objects.name olarak nitelenir.
DROP POLICY IF EXISTS "Members read private property media" ON storage.objects;
CREATE POLICY "Members read private property media" ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'property-media'
    AND public.is_tenant_member(public.marketing_storage_tenant_id(storage.objects.name))
    AND EXISTS (
        SELECT 1 FROM public.properties p
         WHERE p.tenant_id = public.marketing_storage_tenant_id(storage.objects.name)
           AND p.id = public.marketing_storage_property_id(storage.objects.name)
    )
);

DROP POLICY IF EXISTS "Managers upload private property media" ON storage.objects;
CREATE POLICY "Managers upload private property media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'property-media'
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
    AND EXISTS (
        SELECT 1 FROM public.properties p
         WHERE p.tenant_id = public.marketing_storage_tenant_id(storage.objects.name)
           AND p.id = public.marketing_storage_property_id(storage.objects.name)
    )
);

DROP POLICY IF EXISTS "Managers update private property media" ON storage.objects;
CREATE POLICY "Managers update private property media" ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'property-media'
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
)
WITH CHECK (
    bucket_id = 'property-media'
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
    AND EXISTS (
        SELECT 1 FROM public.properties p
         WHERE p.tenant_id = public.marketing_storage_tenant_id(storage.objects.name)
           AND p.id = public.marketing_storage_property_id(storage.objects.name)
    )
);

DROP POLICY IF EXISTS "Managers delete private property media" ON storage.objects;
CREATE POLICY "Managers delete private property media" ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'property-media'
    AND public.can_manage_tenant(public.marketing_storage_tenant_id(storage.objects.name))
);

DO $verify$
DECLARE v_public BOOLEAN; v_limit BIGINT;
BEGIN
    SELECT public, file_size_limit INTO v_public, v_limit FROM storage.buckets WHERE id = 'tenant-assets';
    IF v_public IS DISTINCT FROM false OR v_limit <> 2097152 THEN
        RAISE EXCEPTION 'PHASE74_BUCKET_CONFIGURATION_INVALID';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Managers upload tenant logos') THEN
        RAISE EXCEPTION 'PHASE74_LOGO_POLICY_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 74 OK — logo bucket ve Storage RLS hazir; L-118 duzeltildi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (74, 'phase74_tenant_logo_storage')
ON CONFLICT (version) DO NOTHING;

COMMIT;
