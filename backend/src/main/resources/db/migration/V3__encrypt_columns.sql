-- Move everything derived from speech to AES-256-GCM ciphertext held as bytea.
-- Columns are dropped and re-added rather than converted: there is no in-database
-- encryption function that matches the application's scheme, and any existing
-- plaintext must not survive. Safe here because the table is empty.
alter table recordings drop column title;
alter table recordings drop column transcript;
alter table recordings drop column summary;
alter table recordings drop column summary_original;

alter table recordings add column title bytea not null;
alter table recordings add column transcript bytea;
alter table recordings add column summary bytea;
alter table recordings add column summary_original bytea;
