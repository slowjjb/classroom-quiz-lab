# 퀴즈 실험실 · 0단계 (v0)

초등학교용 실시간 퀴즈 프로젝트의 **개발 환경·실시간 접속 검증판**입니다.

- 교사: Google 로그인 → UID 확인 → 교사 읽기 권한 확인 → 가상 학생 목록 실시간 관찰
- 학생: 익명 로그인 → 가상 닉네임 입력 → 접속 상태 실시간 동기화
- 접속 종료/브라우저 닫기: 서버 측 onDisconnect로 접속 기록 삭제
- 새로고침: 같은 탭에 한해 자동 재접속
- 실명 사용하지 마세요. 아직 실제 게임·점수·정답은 구현되지 않았습니다.

## 파일 목록

- `index.html` : 메인 메뉴
- `teacher.html` : 교사용 테스트 화면
- `student.html` : 학생용 테스트 화면
- `styles.css` : 공통 화면 디자인
- `firebase-config.js` : Firebase 웹 앱 구성 (직접 편집)
- `js/firebase.js` : Firebase 초기화 및 오류 메시지
- `js/teacher.js` : 교사 Google 로그인, 실시간 명단
- `js/student.js` : 학생 익명 로그인, 접속 감지
- `database.rules.json` : Realtime Database 보안 규칙 예시 (교사 UID 치환 필요)

## 1. Firebase 프로젝트 생성

1. https://console.firebase.google.com/ 방문 → '프로젝트 추가'
2. 이름 예: `classroom-quiz-lab-2026` (학급은행과 **별도 프로젝트**)
3. 요금제는 **Spark(무료)** 로 시작. Google Analytics는 현재 단계에서 사용하지 않아도 됩니다.
4. 프로젝트 개요의 `</>`(웹 앱 추가) → 앱 이름 예: `quiz-lab-web` → 앱 등록
5. 나타난 `firebaseConfig` 객체 내용을 복사해 `firebase-config.js`의 해당 값으로 바꿉니다. `databaseURL`은 Realtime Database 생성 후 나온 **실제 데이터베이스 URL**을 사용합니다. (지역에 따라 `firebasedatabase.app`, `firebaseio.com` 등 다를 수 있습니다.)

## 2. Authentication 설정

1. 왼쪽 '빌드(Build) → Authentication → 시작하기'
2. 'Sign-in method(로그인 방법)'에서 **Google** 사용 설정. 필요한 경우 프로젝트 지원 이메일을 지정합니다.
3. 같은 메뉴에서 **익명(Anonymous)** 사용 설정.
4. 'Settings(설정) → Authorized domains(승인된 도메인)'에서 배포하는 호스트를 등록합니다. GitHub Pages라면 `아이디.github.io`만 입력합니다(https://와 저장소 경로 제외).
5. 교사 인증에는 본인 Google 계정을 사용합니다. Google 로그인이 됐다는 것만으로 교사 권한이 부여되지는 않습니다. 실제 DB 읽기 권한은 규칙에 등록한 UID로 제한합니다.

## 3. Realtime Database 생성

1. '빌드 → Realtime Database → 데이터베이스 만들기'
2. 가능한 지역을 선택합니다(지역 선택은 이후 바꾸기 어려우니 유의).
3. **잠금 모드(Locked mode)** 로 생성합니다. 테스트 모드(전체 공개)는 사용하지 않습니다.
4. 데이터베이스 화면에 나타난 URL을 `firebase-config.js`의 `databaseURL`에 정확히 복사합니다.
5. 최종 규칙은 이 프로젝트의 `database.rules.json`을 사용합니다. 교사 UID를 아직 모르면 **잠금 모드로 유지**합니다. 학생 입장 실험은 교사 UID 등록 후 진행하세요.

## 4. GitHub Pages 배포

1. https://github.com/ 에 로그인 → 새 저장소(Repository) 생성. 예: `classroom-quiz-lab`
2. 기존 학급은행과 별도 저장소로 만듭니다.
3. 무료 GitHub Pages를 사용하려면 공개(Public) 저장소로 만듭니다. 공개 코드에는 실명, 비밀번호, Firebase Admin 서비스 계정 키를 넣지 마세요.
4. 압축을 **해제**한 프로젝트 안의 파일들을 저장소 **루트**에 업로드합니다. (`index.html`이 루트에 있어야 함)
5. `Settings → Pages → Build and deployment → Deploy from a branch` → Branch `main` / Folder `/(root)` → Save
6. 배포된 웹사이트 예시: `https://깃허브아이디.github.io/classroom-quiz-lab/`
7. 교사·학생 화면이 표시되는지 먼저 확인합니다. Firebase 설정이 없으면 '설정 필요'라고 표시되는 것이 정상입니다.

## 5. 교사 UID 등록 및 규칙 게시

1. 배포 사이트의 교사 화면으로 이동 → Google 로그인.
2. 교사 UID가 화면에 표시됩니다. (기본 잠금 모드라서 DB 접근은 처음에 거부되어도 정상)
3. `database.rules.json`에서 **`TEACHER_UID_HERE`만** 복사한 교사 UID로 바꿉니다.
4. Firebase Console → Realtime Database → **규칙(Rules)** 탭 → 치환된 JSON 붙여넣기 → 게시(Publish)
5. 교사 화면을 새로고침합니다. '교사 권한 확인'으로 바뀌면 성공입니다.
6. 규칙은 Firebase에 **게시**해야 실제 적용됩니다. GitHub에 파일을 올리는 것만으로는 적용되지 않습니다.

## 6. 학생 테스트

1. **교사 화면은 일반 브라우저**에서 열고, 학생 화면은 **시크릿 창이나 다른 기기**에서 여세요. 같은 브라우저 프로필에선 Firebase 로그인 세션을 공유합니다.
2. 학생 화면에서 가상 이름(예: 테스트학생01) 입력 후 '연결 테스트 시작' 클릭.
3. 교사 화면에 가상 학생이 실시간 표시되는지 확인.
4. 학생 화면을 새로고침했을 때 다시 연결되는지 확인.
5. 학생 화면에서 연결 종료하거나 창을 닫으면, 교사 화면에서 연결 인원이 감소하는지 확인(창 종료/네트워크 단절은 서버 감지에 시간이 걸릴 수 있음).

## 주의 및 범위

- **v0입니다.** 이 버전으로 수업을 운영하거나 실제 학생 이름·학습 기록을 저장하지 마세요.
- 이 규칙은 v0의 '가상 학생 접속 상태' 경로만 허용합니다. 다른 모든 쓰기는 기본 거부입니다.
- 학생 익명 인증을 허용했기 때문에 이 v0 자체에는 초대 코드/세션 접근 통제가 **아직 없습니다**. 배포 링크는 테스트 목적에만 공유하세요.
- Firebase 웹 설정의 API 키 자체는 서버 비밀키가 아니지만, 보안 규칙과 승인된 도메인을 반드시 설정해야 합니다.
- 교사 Google UID를 DB 보안 규칙에 등록해야 명단을 볼 수 있습니다. Google 계정 보유자 전체가 교사 권한을 갖지 않습니다.
- 25명·30개 동시 접속 부하 테스트는 현재 아직 완료된 것이 아니며, v2에서 수행합니다.
- v3부터 정답 및 점수의 신뢰성 확보를 위해 서버 측 검증을 별도 구현해야 합니다. **브라우저에서 답을 판정·점수를 직접 저장하는 방식은 사용하지 않습니다.**
- Firebase JS SDK의 CDN 가져오기는 0단계 설정의 단순화를 위한 것입니다. 기능이 커지면 Vite 등 빌드 시스템을 검토합니다.

## 초기 문제 해결

- `설정 필요` → `firebase-config.js` 값과 배포 반영 여부 확인
- `auth/unauthorized-domain` → Authentication 승인된 도메인에 `아이디.github.io` 추가
- `auth/operation-not-allowed` → Google·익명 로그인 사용 설정
- `permission_denied`(교사) → UID 치환 여부, Firebase Rules 실제 게시 여부 확인
- 학생 연결 실패 → 익명 인증 활성화, 보안 규칙, Database URL 확인
- GitHub Pages가 안 뜸 → `index.html` 루트 위치, Pages main/root 설정, 배포 작업 확인
