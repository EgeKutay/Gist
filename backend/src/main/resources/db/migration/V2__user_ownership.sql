-- Every recording belongs to one Firebase user. NOT NULL without a default is
-- deliberate: there is no sensible owner for pre-auth rows, so this migration
-- only applies to an empty table (development data was dropped).
alter table recordings add column user_uid text not null;

-- The list screen is "this user's recordings, newest first".
create index recordings_user_created on recordings (user_uid, created_at desc);
drop index if exists recordings_created_at_desc;
