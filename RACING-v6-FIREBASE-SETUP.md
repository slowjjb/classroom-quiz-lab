# 퍼플킷 v6 — Firebase Realtime Database 실시간 연동 1차 기반

**상태: 개발 브랜치에 구현 파일 생성. 운영 Firebase 규칙과 main은 변경하지 않음.**

브랜치: feat/racing-realtime-v6

## v6 데이터 구조

| 경로 | 읽기/쓰기 | 용도 |
| --- | --- | --- |
| v6/public/{code} | 교사 쓰기, 등록 학생 읽기 | 상태/목표 거리/순위 |
| v6/privateRuns/{code} | 교사만 | 정답 등 비공개 문제 데이터 |
| v6/memberState/{code}/{uid} | 교사 쓰기, 본인 읽기 | 문항 nonce/시도/정오답 |
| v6/answers/{code}/{uid}/{nonce} | 등록 학생은 한 번 제출, 교사 읽기 | 답안 |
| v6/carRequests/{code}/{uid} | 등록 학생 본인 요청 | 자동차 선택/취소 요청 |
| v6/carRegistry/{code} | **교사만 쓰기**, 등록 학생 읽기 | 자동차 30종의 점유 및 학생별 한 대 제한 |

**중요:** 학생은 자동차 점유 정보를 직접 수정하지 않습니다. 교사 화면이 학생 요청을 자동 처리하고 등록부 전체를 Firebase 트랜잭션으로 변경합니다. 이때 학생 1명당 최대 1대, 자동차 1대당 최대 1명의 규칙을 동시에 지킵니다. 교사가 학생마다 직접 승인할 필요는 없지만 **교사 브라우저를 켜둬야 합니다.**

재접속 때 익명 Firebase UID가 같으면 등록부의 선택 정보가 남습니다. 선택 취소 후에는 기존 차를 다른 학생이 가질 수 있습니다. 경기 시작 후에는 선택/취소를 보안 규칙으로 막습니다.

## 작성한 개발 파일

- [v6 전체 보안 규칙 생성기](js/rules-v6.js): 기존 v0~v5 규칙을 보존하며 v6을 추가
- [보안 규칙 후보](database.rules.v6.CANDIDATE.json): 현재 운영 교사 UID 기반 예시. **테스트 프로젝트에 그대로 붙여 넣지 말 것**
- [자동차 선택 순수 로직](js/racing-garage-core.js)
- [학생 요청 및 교사 자동 배정](js/racing-car-reservations.js)
- [로직 단위 테스트](tests/racing-garage.test.mjs)
- [Firebase 테스트용 페이지](racing-firebase-lab.html)

## 테스트 Firebase 준비 (운영 프로젝트 보호)

1. [Firebase Console](https://console.firebase.google.com/)에서 **기존 운영 프로젝트와 다른 새 테스트 프로젝트**를 만듭니다.
2. Authentication → Sign-in method에서 **Google**과 **Anonymous(익명)** 로그인을 활성화하고 테스트 사이트의 승인 도메인을 확인합니다.
3. Realtime Database를 새로 만듭니다.
4. 프로젝트 설정 → 웹 앱을 등록해 SDK 구성 JSON(apiKey, authDomain, databaseURL, projectId, appId)을 확인합니다. 서비스 계정 키는 사용하지 마세요.
5. GitHub 개발 브랜치 전체 파일을 받거나 로컬 작업 폴더에서 HTTP 서버를 실행합니다. 예: Python 설치 환경에서 명령어 python -m http.server 8000 을 실행한 뒤 http://localhost:8000/racing-firebase-lab.html 에 접속합니다. 브랜치 HTML은 기본 GitHub Pages 운영 주소에 바로 게시되지 않습니다.
6. 테스트 화면에 **테스트 프로젝트의 SDK 구성**을 넣고 교사 Google 로그인을 합니다. 교사 계정의 실제 테스트 UID가 확인됩니다.
7. **전체 보안 규칙 생성** 버튼으로 해당 UID에 맞는 v0~v6 JSON을 생성합니다. 이 JSON **전체**를 **테스트 프로젝트의 Realtime Database → 규칙**에 게시합니다. 운영 프로젝트 규칙은 덮어쓰지 않습니다.
8. 교사 화면에서 임의 6자리 코드로 레이싱 테스트방을 만들고 **교사 화면을 열어 둡니다**.
9. 별도 브라우저/시크릿 창에서 동일 테스트 SDK를 연결하고 익명 학생으로 입장한 뒤, 자동차 미리보기 → 선택 확정을 누릅니다.
10. 학생 두 명이 동일 차를 요청하면 한 명만 배정되는지, 취소 후 다른 학생이 가져갈 수 있는지, 같은 UID의 재접속에서 차가 유지되는지, 시작 이후 선택이 잠기는지 확인합니다.

로직만 검증할 때에는 Node.js가 설치된 저장소 폴더에서 명령어 **node --test tests/racing-garage.test.mjs** 를 사용할 수 있습니다.

## 검증 범위와 다음 단계

- 현재 GitHub 작성/정적 코드 분석까지 완료했습니다. Firebase 규칙을 실제 데이터베이스에서 게시·검증한 상태는 **아닙니다**.
- 25명 실제 동시 접속 테스트도 아직 진행하지 않았습니다.
- Firebase 연결용 테스트 페이지는 인증·차량 선택 기반만 다룹니다. 기존 퍼플킷 QR 입장에 v6 자동차 선택을 연결하거나 문항 채점·이동·아이템을 실제로 동기화한 것은 아닙니다.
- 운영 main의 rooms.html, join.html, version.json, database.rules.json은 이번 단계에서 변경하지 않습니다.
- 테스트가 통과하면 기존 퍼플킷 게임방과 QR 입장을 통합하고 교사 권위의 답안 판정·이동·룰렛·결승선·30초 화면 축소 쿨다운을 구현합니다.
