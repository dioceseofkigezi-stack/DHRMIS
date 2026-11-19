-- Preserve historical records while allowing an administrator to remove an
-- account whose optional attribution fields still point at that user.
-- Ownership links (such as user_roles.user_id) keep their existing cascade,
-- and required attribution links continue to prevent deletion until reassigned.
BEGIN;

DO $migration$
DECLARE
  foreign_key RECORD;
  definition TEXT;
  updated_definition TEXT;
BEGIN
  FOR foreign_key IN
    SELECT constraint_row.oid,
      constraint_row.conname,
      constraint_row.conrelid,
      namespace_row.nspname AS schema_name,
      table_row.relname AS table_name
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = table_row.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'auth.users'::regclass
      AND constraint_row.confdeltype IN ('a', 'r')
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(constraint_row.conkey) AS key_column(attnum)
        JOIN pg_attribute AS column_row
          ON column_row.attrelid = constraint_row.conrelid
          AND column_row.attnum = key_column.attnum
        WHERE column_row.attnotnull
      )
  LOOP
    definition := pg_get_constraintdef(foreign_key.oid);

    IF position(' ON DELETE NO ACTION' IN definition) > 0 THEN
      updated_definition := replace(
        definition,
        ' ON DELETE NO ACTION',
        ' ON DELETE SET NULL'
      );
    ELSIF position(' ON DELETE RESTRICT' IN definition) > 0 THEN
      updated_definition := replace(
        definition,
        ' ON DELETE RESTRICT',
        ' ON DELETE SET NULL'
      );
    ELSE
      updated_definition := regexp_replace(
        definition,
        '(REFERENCES [^ ]+\([^)]*\))',
        '\1 ON DELETE SET NULL'
      );
    END IF;

    IF updated_definition = definition THEN
      RAISE EXCEPTION 'Could not make optional account reference %.% nullable on deletion',
        foreign_key.table_name,
        foreign_key.conname;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.conname
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.conname,
      updated_definition
    );
  END LOOP;
END;
$migration$;

COMMIT;
