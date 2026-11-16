-- LOTTO-LAB 앱 전용: push_devices · subscription_accounts (문서 docs/05_DATA_MODEL.md#2에만 있고 레포 마이그레이션 없음)
-- 소유는 user안·org안 모두 user_id(기기·스토어 계정은 사람에 묶임). 전제: user/ 또는 org/ 0001이 먼저 적용되어 nomad_lottolab 스키마가 있음.
begin;

create table nomad_lottolab.push_devices (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  platform      text        not null,
  token         text        not null,
  notify_opt_in boolean     not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint push_devices_platform_chk check (platform in ('android', 'ios', 'windows')),
  constraint push_devices_token_key unique (token)
);
comment on table nomad_lottolab.push_devices is '푸시 기기 토큰. 본인 CRUD, 발송은 service_role. 계정 전환 시 토큰 이전은 알림 작업에서 설계.';
create index push_devices_user_id_idx on nomad_lottolab.push_devices (user_id);
alter table nomad_lottolab.push_devices enable row level security;
revoke all on table nomad_lottolab.push_devices from anon, authenticated, public, service_role;
grant select, insert, delete on table nomad_lottolab.push_devices to authenticated;
grant update (platform, token, notify_opt_in, last_seen_at) on table nomad_lottolab.push_devices to authenticated;
grant select on table nomad_lottolab.push_devices to service_role;
create policy push_devices_select_own on nomad_lottolab.push_devices
  for select to authenticated using ((select auth.uid()) = user_id);
create policy push_devices_insert_own on nomad_lottolab.push_devices
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_devices_update_own on nomad_lottolab.push_devices
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_devices_delete_own on nomad_lottolab.push_devices
  for delete to authenticated using ((select auth.uid()) = user_id);

-- state 값 목록은 결제 결정(Q3) 후 확정: 지금은 not null만(확정되면 check 추가).
create table nomad_lottolab.subscription_accounts (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  store      text        not null,
  product_id text        not null,
  state      text        not null,
  created_at timestamptz not null default now(),
  constraint subscription_accounts_user_store_product_key unique (user_id, store, product_id)
);
comment on table nomad_lottolab.subscription_accounts is '스토어 구독 계정(P2). 본인 SELECT, 쓰기는 service_role(영수증 검증). state 값은 Q3 후 확정.';
alter table nomad_lottolab.subscription_accounts enable row level security;
revoke all on table nomad_lottolab.subscription_accounts from anon, authenticated, public, service_role;
grant select on table nomad_lottolab.subscription_accounts to authenticated;
grant select, insert, update, delete on table nomad_lottolab.subscription_accounts to service_role;
create policy subscription_accounts_select_own on nomad_lottolab.subscription_accounts
  for select to authenticated using ((select auth.uid()) = user_id);

commit;
