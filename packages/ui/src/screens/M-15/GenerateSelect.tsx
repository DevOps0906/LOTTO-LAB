// M-15 추천 복권 선택: 로또·연금 생성기로 이동, 최근 생성한 복권의 지난 설정으로 다시 만들기(생성기가 지난 조건을 복원 — task-018·019). 생성은 기기에서 실행 — 오프라인에서도 된다.
// 운세·테마 번호(M-17·M-19)는 P1이라 버튼을 두지 않는다.
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { StateView } from "../../components/StateView";
import { GAME_NAME, formatTime, useAsync, type Generated, type ScreenCore } from "../common/data";

/** lottoLast·pensionLast = 지난 설정을 복원해 여는 생성기 주소 */
export type GenerateSelectLinks = { home: string; lotto: string; pension: string; lottoLast: string; pensionLast: string };

export type GenerateSelectProps = {
  core: Pick<ScreenCore, "generator">;
  links: GenerateSelectLinks;
};

export function GenerateSelect({ core, links }: GenerateSelectProps) {
  const [last] = useAsync<Generated | undefined>(async () => (await core.generator.history())[0]);

  return (
    <div className="ll-select">
      <nav className="ll-breadcrumb" aria-label="현재 위치">
        <ol>
          <li>
            <a href={links.home}>홈</a>
          </li>
          <li aria-current="page">추천</li>
        </ol>
      </nav>
      <Header title="번호 추천" subtitle="번호는 이 기기에서 만들어집니다. 오프라인에서도 생성할 수 있습니다." />

      <div className="ll-select__grid">
        <Card title="로또 6/45">
          <p className="ll-select__desc">1~45 중 6개 번호 조합을 만듭니다. 고정수·제외수와 게임 수를 정할 수 있습니다.</p>
          <a className="ll-button" data-variant="primary" data-block="true" href={links.lotto}>
            로또 번호 생성
            <Icon name="arrow" />
          </a>
        </Card>
        <Card title="연금복권 720+">
          <p className="ll-select__desc">1~5조와 여섯 자리 숫자 조합을 만듭니다. 조와 자리별 숫자를 정할 수 있습니다.</p>
          <a className="ll-button" data-variant="pension" data-block="true" href={links.pension}>
            연금복권 번호 생성
            <Icon name="arrow" />
          </a>
        </Card>
      </div>

      <Card title="지난 설정으로 다시 만들기" busy={last.status === "loading"}>
        {last.status === "loading" && <StateView kind="loading" title="이 기기의 생성 기록을 읽는 중입니다" />}
        {last.status === "failed" && (
          <StateView kind="error" title="최근 생성 기록을 읽지 못했습니다" description="기본값으로 시작합니다. 위에서 복권을 골라 생성해 주세요." />
        )}
        {last.status === "done" && !last.value && (
          <StateView kind="empty" title="이전 생성 기록이 없습니다" description="처음에는 기본 조건으로 생성합니다. 위에서 복권을 골라 주세요." />
        )}
        {last.status === "done" && last.value && (
          <div className="ll-select__reuse">
            <p>
              최근 생성 <strong>{GAME_NAME[last.value.game]}</strong>{" "}
              <time className="ll-muted" dateTime={last.value.created_at}>
                {formatTime(last.value.created_at)}
              </time>
            </p>
            <a
              className="ll-button"
              data-variant="secondary"
              data-block="true"
              href={last.value.game === "lotto" ? links.lottoLast : links.pensionLast}
            >
              <Icon name="redo" />
              지난 설정으로 다시 만들기
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
