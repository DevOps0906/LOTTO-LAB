-- task-043a 가입 동의 기록: user_consents (P1)
-- 근거: tasks/task-043.md 팀장 결정 ⑦(가입 시 약관·개인정보·만 19세 동의 기록), docs/05_DATA_MODEL.md#2·#3
-- 추가 전용 이력: 본인 SELECT·INSERT만(UPDATE·DELETE 없음). 약관 개정 후 재동의는 새 행. 계정 삭제 시 CASCADE 파기.
-- 권한: fortune_profiles와 같은 방식(모두 회수 후 필요한 것만 GRANT, RLS 조건은 (select auth.uid())).

create table public.user_consents (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  terms_version    text        not null,
  privacy_version  text        not null,
  adult_confirmed  boolean     not null,
  consented_at     timestamptz not null default now(),   -- 서버 값만(열 GRANT에서 제외)
  constraint user_consents_adult_chk check (adult_confirmed = true),   -- 만 19세 이상 확인 필수
  constraint user_consents_terms_version_chk check (char_length(terms_version) between 1 and 32),
  constraint user_consents_privacy_version_chk check (char_length(privacy_version) between 1 and 32)
);

comment on table public.user_consents is
  '가입 동의 기록(약관·개인정보 처리방침 버전·만 19세 확인, task-043a). 본인 SELECT/INSERT만(추가 전용), consented_at은 서버 시각, 계정 삭제 시 CASCADE 파기.';

create index user_consents_user_id_idx on public.user_consents (user_id, consented_at desc);

alter table public.user_consents enable row level security;
revoke all on table public.user_consents from anon, authenticated, public, service_role;
grant select on table public.user_consents to authenticated;
-- id·consented_at은 서버 값만(DEFAULT). user_id는 RLS WITH CHECK가 본인 uid만 허용(위조 시 42501).
grant insert (user_id, terms_version, privacy_version, adult_confirmed) on table public.user_consents to authenticated;

create policy user_consents_select_own on public.user_consents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_consents_insert_own on public.user_consents
  for insert to authenticated with check ((select auth.uid()) = user_id);
