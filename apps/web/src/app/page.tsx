import { InstallButtons } from "@/components/InstallButtons";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WaitlistForm } from "@/components/WaitlistForm";

const features = [
  {
    title: "번호 생성",
    body: "로또 6/45·연금복권 720+ 번호를 고정수·제외수 같은 조건으로 만들어 봐요. 만든 번호는 추천일 뿐 구매 기록이 아니에요.",
  },
  {
    title: "통계 살펴보기",
    body: "과거 회차의 번호별 출현 빈도와 홀짝 분포를 기준 회차 범위·표본 수와 함께 보여 드려요. 미래 결과를 예측하지 않아요.",
  },
  {
    title: "내 번호 기록",
    body: "즐겨찾기한 번호와 실제로 산 번호를 따로 기록하고, 회차 결과가 나오면 당첨 여부를 확인해요.",
  },
];

const faqs = [
  {
    q: "로그인 없이도 쓸 수 있나요?",
    a: "네. 게스트로 번호 생성과 통계 보기를 쓸 수 있어요. 기록을 여러 기기에서 이어 보려면 로그인이 필요해요.",
  },
  {
    q: "내 번호는 어디에 저장되나요?",
    a: "게스트일 때는 이 기기 안에만 저장돼요. 앱을 지우면 함께 사라져요.",
  },
  {
    q: "회차 결과는 어디서 가져오나요?",
    a: "공식 발표된 당첨 결과를 출처로 표시하고, 마지막 갱신 시각을 함께 보여 드려요. 이 앱은 공식 서비스가 아니에요.",
  },
  {
    q: "복권을 여기서 살 수 있나요?",
    a: "아니요. LOTTO LAB은 복권을 판매하거나 구매를 대행·중개하지 않아요. 번호 생성·통계·기록 도구예요.",
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-page">
        {/* hero */}
        <section className="hero-surface relative mt-4 overflow-hidden rounded-card p-6 shadow-raised md:p-8 lg:mt-8 lg:p-12">
          <div className="flex items-center justify-between gap-6">
            <div className="max-w-2xl">
              <span className="hero-tag inline-block rounded-pill px-3 py-0.5 text-caption font-bold">
                로또 6/45 · 연금복권 720+
              </span>
              <h1 className="mt-3 text-display font-extrabold leading-tight tracking-tight">
                데이터로 살펴보는
                <br />
                로또·연금 번호와 개인 기록
              </h1>
              <p className="mt-3 text-navy-muted">
                번호 생성, 과거 회차 통계, 내 번호 기록을 한곳에서. 통계는 과거 기록이며 미래 결과를 예측하지 않아요.
              </p>
              <div className="mt-6">
                <InstallButtons />
              </div>
            </div>
            <div aria-hidden="true" className="relative hidden size-48 shrink-0 md:block lg:size-60">
              <div className="ball-deco absolute bottom-0 left-0 flex size-32 items-center justify-center rounded-pill font-mono text-kpi font-extrabold text-primary-soft-fg lg:size-40">
                7
              </div>
              <div className="ball-deco-pension absolute top-0 right-0 flex size-20 items-center justify-center rounded-pill font-mono text-h2 font-extrabold text-pension-soft-fg lg:size-24">
                1조
              </div>
            </div>
          </div>
        </section>

        {/* 고지 */}
        <section aria-label="이용 안내" className="mt-gap rounded-card border border-border bg-surface p-5 shadow-card">
          <ul className="grid gap-2 text-caption text-text-muted md:grid-cols-3">
            <li>
              <strong className="text-text">만 19세 이상</strong>만 이용할 수 있어요.
            </li>
            <li>
              <strong className="text-text">복권 판매·구매 대행 없음</strong> — 번호 기록 도구예요.
            </li>
            <li>
              <strong className="text-text">미래 예측 아님</strong> — 통계는 과거 회차 기록이에요.
            </li>
          </ul>
        </section>

        {/* 기능 안내 카드 3 */}
        <section aria-labelledby="features-title" className="mt-12">
          <h2 id="features-title" className="text-h1 font-extrabold">
            앱에서 할 수 있는 일
          </h2>
          <div className="mt-4 grid gap-gap md:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="rounded-card border border-border bg-surface p-6 shadow-card">
                <h3 className="text-h2 font-bold">{f.title}</h3>
                <p className="mt-2 text-text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 사전알림 + FAQ */}
        <div className="mt-12 grid gap-gap lg:grid-cols-2">
          <section
            id="waitlist"
            aria-labelledby="waitlist-title"
            className="rounded-card border border-border bg-surface p-6 shadow-card md:p-8"
          >
            <h2 id="waitlist-title" className="text-h1 font-extrabold">
              출시 사전알림
            </h2>
            <p className="mt-2 mb-5 text-text-muted">
              앱이 나오면 이메일로 한 번 알려 드려요. 신청 후 받은 확인 메일의 링크에서 확정해야 등록돼요.
            </p>
            <WaitlistForm />
          </section>

          <section aria-labelledby="faq-title" className="rounded-card border border-border bg-surface p-6 shadow-card md:p-8">
            <h2 id="faq-title" className="text-h1 font-extrabold">
              자주 묻는 질문
            </h2>
            <div className="mt-4 divide-y divide-border">
              {faqs.map((f) => (
                <details key={f.q} className="py-3">
                  <summary className="cursor-pointer font-bold">{f.q}</summary>
                  <p className="mt-2 text-text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
