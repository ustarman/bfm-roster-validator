# 작업 규칙 (중요 — 반드시 준수)

## 이 앱은 실제 로스터 검증에 쓰인다
- BFM Roster Validator는 James가 드라이버 로스터 짤 때 BFM(Basic Fatigue Management)
  위반을 사전에 잡아주는 도구다.
- 배포 주소: https://ustarman.github.io/bfm-roster-validator/
- 로컬 개발 서버: `npm run dev` (포트 5183, `.claude/launch.json`에도 등록됨)
- `git push` → GitHub Actions가 자동 테스트 → 빌드 → **gh-pages 브랜치에 바로 반영된다.**
- 라이브 사이트와 로컬 dev 서버는 **origin이 달라서 localStorage가 공유되지 않는다.**
  로컬에서 넣은 테스트 데이터가 라이브에 보이지 않는 건 정상.

## 변경 전 승인 규칙
1. **기존 파일을 수정하기 전에** 반드시 다음을 설명하고 승인을 받는다:
   - 어떤 파일을 수정하는지
   - 무엇이 어떻게 바뀌는지 (기존 동작과의 차이)
   - 특히 `src/lib/engine.ts`, `src/lib/inshift.ts`(판정 로직)를 건드릴 땐
     반드시 관련 테스트도 같이 갱신하고 결과를 보여준다.
2. **git commit / git push는 별도 승인**을 받는다. 코드 수정 승인 ≠ 배포 승인.
   push하면 라이브 사이트가 즉시 바뀌므로 푸시 전에 반드시 다시 확인받는다.
3. **여러 작업을 묶어서 한 번에 승인받지 않는다.** 배포는 항상 개별 확인.
4. 읽기/조사/신규 파일 생성/테스트 실행은 자유롭게 해도 된다 (기존 동작에 영향 없음).

## 인증 / 토큰
- GitHub push 인증은 macOS 키체인(osxkeychain)에 저장된 Personal Access Token(classic)을 씀.
- 2026-08-11에 새로 발급한 토큰(`repo` + `workflow` 스코프, note: "git push (repo + workflow)")은
  **2026-09-10에 만료**된다. 그 이후 push가 다시 막히면 GitHub Settings → Developer settings →
  Personal access tokens (classic)에서 새로 발급하고, 아래 방법으로 키체인을 교체해야 한다:
  ```bash
  security add-internet-password -a ustarman -s github.com -w "<새 토큰>" -U
  ```
  (주의: `git credential approve`는 이 환경에서 기존 키체인 항목을 실제로 갱신하지 못하는 걸
  확인했다 — 반드시 `security add-internet-password ... -U`로 직접 덮어써야 한다.)
- `.github/workflows/deploy.yml` 같은 워크플로 파일을 push하려면 토큰에 `workflow` 스코프가
  **반드시** 있어야 한다. 없으면 `refusing to allow a Personal Access Token ... without
  'workflow' scope` 에러가 난다.
- 과거 사고: OT-Calculator 저장소의 git remote URL에 PAT가 평문으로 박혀 있던 걸 발견함
  (2026-08-11). 이 프로젝트는 그 방식을 쓰지 않고 키체인 인증만 사용한다 — remote URL에
  토큰을 직접 넣지 말 것.

## 기술 참고사항
- Node 22, Vite 8, React 19. 백엔드 없음 — 완전히 클라이언트 사이드(로컬 localStorage)로만 동작.
  그래서 GitHub Actions Secrets나 서버 환경변수가 전혀 필요 없다.
- `vite.config.ts`의 `base: '/bfm-roster-validator/'`는 GitHub Pages 프로젝트 사이트 경로에
  맞춘 것. 저장소 이름을 바꾸면 이 값도 같이 바꿔야 함.
- 코드 안에서 정적 에셋(로고 등)을 참조할 때 `"/assets/..."`처럼 절대경로를 하드코딩하면
  base path가 안 붙어서 배포 후 깨진다 — 반드시
  `` `${import.meta.env.BASE_URL}assets/...` `` 형태로 써야 한다.
- `window.prompt()` / `window.confirm()`은 임베디드/프리뷰 브라우저 일부 환경에서 막혀 있어
  조용히 실패한다. 그래서 드라이버 추가/이름변경/삭제/주간 초기화는 전부
  `src/components/Dialog.tsx`의 자체 모달(PromptDialog/ConfirmDialog)을 쓴다 — 절대 네이티브
  prompt/confirm으로 되돌리지 말 것.
- 개발 서버는 `server: { host: true }`로 IPv4/IPv6 둘 다 바인딩한다. 이거 없으면 일부
  브라우저에서 `localhost`가 IPv4로 먼저 붙으려다 실패한다 (2026-08-11에 실제로 겪은 문제).
- push 전 `npm test`(vitest, 45개)와 `npm run build`가 로컬에서 통과하는지 확인. CI도 push마다
  이 둘을 돌리고 실패하면 배포를 막는다.

## 판정 로직 구조 (건드릴 때 특히 주의)
- `src/lib/inshift.ts`: 시프트 길이만으로 시프트 내 최소 휴식(6¼h/9h/12h 규칙)을 역산.
- `src/lib/engine.ts`: 24시간/7일/14일 규정을 달력 주 단위가 아니라 **진짜 슬라이딩 윈도우**로
  검사. 24시간 연속휴식 규칙은 "주요 휴식(7h 이상) 사이의 근무 블록"을 기준으로 판단하지,
  자정 기준 고정 윈도우가 아님 — 이 전제를 깨는 수정은 오탐/누락을 만든다.
- `src/lib/suggest.ts`: "최대 종료시각/최소 시작시각" 힌트는 **이 시프트가 새로 만드는 위반만**
  봐야 한다 (다른 날짜의 기존 위반에 오염되면 안 됨) — `isCleanForDate`가 그 역할을 함.
- 테스트(`*.test.ts`)가 이 전제들을 다 검증하고 있으니, 로직 변경 시 테스트부터 갱신할 것.
