# PaperKo

논문 PDF 원문과 문단별 한국어 번역을 나란히 검토하고, Figure와 Table의 핵심 결과를 해설해 주는 연구 도구입니다.

## 공개 데모

- GitHub Pages: https://ttzero25.github.io/paperko/
- `main` 브랜치가 갱신되면 `.github/workflows/pages.yml`을 통해 자동 배포됩니다.

## 주요 화면

- PDF 업로드 및 분석 진행 상태
- 원문 PDF와 문단별 원문/번역 동시 검토
- Figure와 Table 결과 해설
- 폴더 기반 논문 라이브러리
- `ko.pdf` 내보내기

현재 공개 데모는 정적 프런트엔드 프로토타입입니다. `backend/`에는 Cloudflare Worker 기반 저장소 API의 초기 구현이 포함되어 있지만, 실제 AI 번역 파이프라인과 프런트엔드 연동은 아직 필요합니다.
