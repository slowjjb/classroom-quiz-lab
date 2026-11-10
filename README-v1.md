# 퀴즈 실험실 v1 — 블루킷 CSV 문제 관리

이 ZIP은 **2026-11-10 기준 v0에서 v1로 올리기 위한 업그레이드 파일**입니다. 이미 작동하는 `js/firebase.js`, `js/teacher.js`, `js/student.js`, `firebase-config.js` 및 기존 Realtime Database 데이터는 수정하지 않습니다.

## 핵심 기능

- 기존 블루킷 CSV(A~J, 10열) 그대로 가져오기
- UTF-8(BOM 포함), CP949/EUC-KR, 쉼표·따옴표·줄바꿈이 들어간 CSV 처리
- 객관식/주관식(`typing`) 자동 판별, 주관식 허용 답 1~4개
- 잘못된 문항 번호, 정답 번호, 제한 시간, 보기 누락, `typing` 등 오류 위치 표시
- 문항 편집, 10열 미만 문항의 **명시적인 열 수 보정**, 다시 검사
- Firebase에 문제 세트 저장·불러오기·수정·삭제
- 편집한 문항을 블루킷 호환 CSV로 다운로드
- 학생 계정으로는 정답과 문제 목록을 읽을 수 없도록 하는 v1 접근 규칙
- 기존 교사/가상 학생 실시간 접속 기능(v0) 보존

## 현재 단계에서 되지 않는 것

- 학생에게 퀴즈 출제 / 게임 방 / 실시간 순위 (v2~v3 예정)
- 문항 이미지 첨부 (후속 버전)
- 문제별 학습 분석 (v3 수집, v7 고도화)
- Firebase 서버에서 정답 판정 (v3에서 별도 안전한 서버 측 처리 필요)

## 설치 순서 (이미 작동하는 v0 기준)

### 1. GitHub 파일 업로드

1. `quizlab-v1-upgrade.zip`의 압축을 풉니다.
2. GitHub 저장소 `https://github.com/slowjjb/classroom-quiz-lab`에 접속합니다.
3. `Add file` → `Upload files`를 클릭합니다.
4. **압축을 푼 폴더 안의 파일과 `js`, `tests` 폴더를 함께** 업로드합니다.
5. 기존 파일 덮어쓰기가 요청되면 그대로 진행합니다.
6. 아래 `Commit changes`를 누릅니다.
7. GitHub Pages 웹주소에서 `https://slowjjb.github.io/classroom-quiz-lab/sets.html`을 엽니다.

**주의:** 이 업그레이드 ZIP에는 `firebase-config.js`와 `database.rules.json`이 없습니다. 이미 정상인 설정을 실수로 초기화하지 않기 위해서입니다.

### 2. Firebase 보안 규칙 추가

1. `sets.html`을 열고 기존 교사 Google 계정으로 로그인합니다.
2. 처음에는 "v1 규칙 필요"라고 표시될 수 있습니다. 정상입니다.
3. `전체 규칙 복사`를 누릅니다. 현재 로그인한 UID를 포함하는 **v0+v1 통합 규칙**이 복사됩니다.
4. Firebase 콘솔 → Realtime Database → **규칙**에서 기존 내용을 전체 교체하여 **게시**합니다.
5. GitHub 저장소의 기존 `database.rules.json`도 **같은 내용**으로 교체하고 `Commit changes` 합니다. GitHub 저장만으로 Firebase 규칙이 바뀌지는 않습니다.
6. `sets.html`로 돌아와 `권한 다시 확인`을 클릭합니다.
7. `교사 권한 확인`으로 바뀌면 성공입니다.

위의 생성된 규칙은 기존 `v0/presence`를 포함하고 학생 연결 코드를 그대로 유지합니다. **규칙의 `.read` / `.write`를 true로 바꾸지 마세요.**

### 3. CSV 가져오기

1. `tests/정상_테스트_20문항.csv`를 선택합니다.
2. 20문항 전체가 표시되고 "검증 통과"하는지 확인합니다.
3. 문항 번호/문제/보기/제한 시간/정답을 편집할 수 있습니다.
4. `Firebase에 저장`을 누릅니다.
5. 위쪽 저장 목록에 나타난 세트를 다시 불러오고, 편집 후 저장해 봅니다.
6. `CSV` 버튼으로 원본 형식의 CSV를 다운로드합니다.
7. `tests/오류_테스트_8문항.csv`도 업로드하여 오류가 표시되는지 확인합니다. 이 파일은 정상 저장을 위한 것이 아닙니다.

### 4. 기존 v0 기능 보존 테스트

- `teacher.html`에서 Google 로그인, 접속 학생 숫자 확인
- 시크릿 창에서 `student.html`로 `테스트학생1` 익명 로그인
- 교사 화면에서 즉시 접속 확인
- 학생 창을 닫으면 교사 화면에서 자동 제거

## CSV 형식

| 열 | 내용 |
|---|---|
| A | 1부터 연속 번호 |
| B | 문제 문장 |
| C~F | 객관식 보기 4개 또는 주관식 허용 답 1~4개 |
| G | 정수 제한 시간(1~600초, 기본 데이터는 30초) |
| H | 객관식 정답 번호 1~4; 주관식은 공란 |
| I | 반드시 공란 |
| J | 객관식 공란, 주관식 정확히 `typing` |

첫 행에 명확한 한글/영문 번호·문제 헤더가 있으면 자동으로 제외합니다. 파일을 임의로 수정하지 않고 인용부호와 개행을 해석합니다. 열 개수 부족 등 오류를 자동으로 **숨기지 않으며** 저장 전 명시적으로 확인해야 합니다.

## 데이터 저장 구조

```text
v0/presence/{anonymousUid}/{sessionId}     ← 기존 연결 상태
v1/questionSets/{setId}/title              ← 문제 세트 이름
v1/questionSets/{setId}/questions/q0001    ← 문항과 정답(교사만 읽기)
```

GitHub Pages에는 `sets.html`, JavaScript, CSS만 공개됩니다. 문항별 정답은 Firebase Database에만 저장합니다. Firebase 웹 API 설정은 클라이언트 식별자이며 교사용 서비스 계정 비밀키가 아닙니다.

## 파일 구성

```text
index.html          → 첫 화면 v1
teacher.html        → 기존 교사용 접속 현황 + 문제 관리 링크
student.html        → 기존 학생 연결 검증(기능 변화 없음)
sets.html           → 새 문제 관리 화면
styles.css          → 기존 스타일 + 문제 관리 스타일
js/csv.js           → CSV 파서 / 검증
js/sets.js          → Firebase 문제 관리 화면 로직
js/rules.js         → 로그인 UID 기반 통합 보안 규칙 생성
README-v1.md        → 설치 / 기능 안내
tests/정상_테스트_20문항.csv
tests/오류_테스트_8문항.csv
tests/test-parser.mjs → Node.js 정적 단위 테스트(선택)
```

## 현재 검증 범위

CSV 단위 테스트를 실행하여 정상 20문항, 주관식 4문항, 객관식 16문항, 특수문자, 복수행 문항, 편집본 CSV 재해석, 고의 오류, 규칙 JSON 구성 검사까지 통과했습니다. **실제 사용자의 Firebase 프로젝트 쓰기 및 브라우저별 동작은 배포 후 교사가 확인해야 합니다.**
