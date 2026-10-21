create table if not exists users (id text primary key, data jsonb not null);
create table if not exists payments (id text primary key, data jsonb not null);
create table if not exists certs (id text primary key, data jsonb not null);
create index if not exists users_email on users ((data->>'email'));
create index if not exists users_idn on users ((data->>'idNumber'));
create index if not exists users_phone on users ((data->>'phone'));
create index if not exists users_boss on users ((data->>'boss'));
create index if not exists payments_uid on payments ((data->>'uid'));
