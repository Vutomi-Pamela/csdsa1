-- Run once in Neon SQL Editor.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS certs (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users ((data->>'email'));
CREATE INDEX IF NOT EXISTS users_id_number_idx ON users ((data->>'idNumber'));
CREATE INDEX IF NOT EXISTS users_phone_idx ON users ((data->>'phone'));
CREATE INDEX IF NOT EXISTS users_boss_idx ON users ((data->>'boss'));
CREATE INDEX IF NOT EXISTS payments_uid_idx ON payments ((data->>'uid'));
