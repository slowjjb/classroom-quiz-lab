# PurpleKit v3.11 — 공통 디자인 통합

- **v3.10 포함:** 문제 세트 관리의 좌측 인증/세트 목록·우측 문항 편집 2열 레이아웃, 가독성 개선.
- **v3.11 추가:** 메인, 교사 방 관리, 학생 입장/대기실, 학생 퀴즈, 캐릭터 선택, 구형 교사/학생 테스트 화면의 색상/로고/카드·버튼 통일.
- 큰 화면의 교사 방 관리에는 스크롤과 함께 따라오는 왼쪽 인증/빠른 메뉴를 배치했습니다.
- 디벗(가로 화면)에서 문제·보기·제출 버튼이 보이는 기존 반응형 레이아웃, 정답·오답 구분, 점수와 순위표는 유지합니다.
- 기존 HTML에서 사용하는 모든 ID를 보존하였으며 Firebase 경로, 데이터 구조, 보안 규칙, 채점 코드는 변경하지 않았습니다.
- 새로운 CSS 파일을 생성하지 않았고 기존 `styles.css`, `arcade.css`, `avatars.css`를 갱신했습니다.

## 업로드 파일

- index.html, sets.html, rooms.html, join.html, teacher.html, student.html, loadtest.html
- styles.css, arcade.css, avatars.css
- js/sets.js (v3.10의 문항 편집 가독성 개선 기능 포함)
- INSTALL-v3.11.txt

업그레이드 ZIP은 **v3.9 → v3.11 직접 적용 가능**하며 `firebase-config.js`와 `database.rules.json`을 포함하지 않습니다.
