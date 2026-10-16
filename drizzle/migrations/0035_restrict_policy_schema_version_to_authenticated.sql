DROP POLICY IF EXISTS privacy_policy_read ON public.privacy_policy;
CREATE POLICY privacy_policy_read ON public.privacy_policy FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS schema_version_read ON public.schema_version;
CREATE POLICY schema_version_read ON public.schema_version FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.privacy_policy FROM anon;
REVOKE SELECT ON public.schema_version FROM anon;