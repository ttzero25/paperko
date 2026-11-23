# PaperKo

논문 PDF 원문과 문단별 한국어 번역을 나란히 검토하고, Figure와 Table의 핵심 결과를 해설해 주는 연구 도구입니다.

## 공개 데모

- GitHub Pages: https://ttzero25.github.io/paperko/
- `main` 브랜치가 갱신되면 `.github/workflows/pages.yml`을 통해 자동 배포됩니다.

## 주요 화면

- PDF 업로드 및 분석 진행 상태
- 원문 PDF와 문단별 원문/번역 동시 검토
- Figure와 Table 결과 해설
- `Library`: 브라우저에 분석 기록이 누적되는 폴더 기반 논문 라이브러리
- `Connect`: 공통 키워드로 관련 논문을 잇는 연결 지도
- 첫 줄 들여쓰기와 문단 간격을 기준으로 묶는 문단 단위 번역 보기
- 한 문단 제한 없이 원문·번역문의 여러 문단에 걸쳐 선택할 수 있는 3색 형광펜
- `ko.pdf` 내보내기

현재 공개 데모는 정적 프런트엔드 프로토타입입니다. 논문함 데이터는 브라우저 `localStorage`에 보관됩니다. `backend/`에는 Cloudflare Worker 기반 저장소 API의 초기 구현이 포함되어 있지만, 계정 간 동기화와 실제 AI 번역 파이프라인 연동은 아직 필요합니다.
