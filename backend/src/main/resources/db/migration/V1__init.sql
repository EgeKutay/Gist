-- Initial schema. One table: a recording owns its transcript and summary.
create table recordings (
    id               uuid         primary key,
    title            text         not null,
    audio_path       text,               -- relative to gist.storage.dir; null once audio is gone
    duration_sec     numeric(10, 2),
    transcript       text,
    -- summary is what the user sees; summary_original keeps the model's
    -- untouched output so an edit can always be reverted.
    summary          jsonb,
    summary_original jsonb,
    -- set when the transcript is edited after a summary exists, so the UI can
    -- warn that the summary describes older text.
    summary_stale    boolean      not null default false,
    created_at       timestamptz  not null default now()
);

-- The list screen is always "newest first".
create index recordings_created_at_desc on recordings (created_at desc);
