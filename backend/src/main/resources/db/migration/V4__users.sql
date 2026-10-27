-- Accounts move from Firebase to the backend itself: email + password.
create table users (
    id            uuid         primary key,
    -- stored lowercased and trimmed, so uniqueness is case-insensitive
    email         text         not null unique,
    password_hash text         not null,   -- bcrypt
    created_at    timestamptz  not null default now()
);

-- recordings.user_uid now references users.id. Rows owned by Firebase UIDs
-- would have no account here; rather than silently deleting them, the cast and
-- the foreign key make this migration fail if any exist.
alter table recordings alter column user_uid type uuid using user_uid::uuid;
alter table recordings add constraint recordings_user_fk
    foreign key (user_uid) references users (id) on delete cascade;
