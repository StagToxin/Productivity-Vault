# Sunucu (SQL) testleri

Supabase'e yüklemeden önce gizlilik kurallarını ve lig hesabını yerel bir PostgreSQL'de denemek için:

```bash
createdb vt_test
cat supabase/test/auth-stub.sql supabase/schema.sql supabase/social.sql | psql -v ON_ERROR_STOP=1 -q vt_test
psql -q vt_test < supabase/test/social.test.sql   # sonunda "HEPSİ GEÇTİ" yazmalı
```

`auth-stub.sql` yalnızca test içindir (Supabase'in `auth` şemasını taklit eder) — Supabase'de ÇALIŞTIRMA.
