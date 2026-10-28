-- Addresses a user has mailed meetings to, offered as suggestions next time.
-- Plaintext and lowercased, like users.email, so the unique key deduplicates.
create table saved_recipients (
    id           uuid         primary key,
    user_uid     uuid         not null references users (id) on delete cascade,
    email        text         not null,
    last_used_at timestamptz  not null default now(),
    unique (user_uid, email)
);

create index saved_recipients_user_recent on saved_recipients (user_uid, last_used_at desc);
