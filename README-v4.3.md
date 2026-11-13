# 퍼플킷 v4.3 — 교사 BGM 게임 시작 시 자동 켜기

- **클래식:** 첫 `다음 문제 출제` 버튼 클릭 시 교사용 Web Audio를 활성화하고 문제가 실제로 시작되면 BGM을 재생합니다.
- **골드 퀘스트:** `골드 퀘스트 시작` 클릭 시 모험 음악을 자동 선택하고, Firebase 게임 상태가 `playing`으로 바뀌면 BGM을 재생합니다.
- 게임 진행 도중 교사가 `🔊 BGM 끄기`를 누르면 이후 문제에서도 재생되지 않습니다. 다시 `🔇 BGM 켜기`를 누르면 재생됩니다.
- 게임 종료, 방 변경 때 음악을 자동 정지하고 버튼을 초기 상태로 되돌립니다.
- 기존 BGM 5종, 효과음, 볼륨, 보상 확률, 정답률, 게임 데이터, 보안 규칙은 변경하지 않습니다.
- 학생용 화면에는 BGM을 추가하지 않습니다.
- 최신 브라우저는 사용자 제스처가 없는 페이지 자동 재생을 제한합니다. 따라서 새로고침으로 이미 진행 중인 방에 들어온 경우에는 교사용 BGM 버튼을 수동으로 눌러야 할 수 있습니다.

## 업로드

1. `purplekit-v4.3-upgrade.zip` 압축을 풀고 `https://github.com/slowjjb/classroom-quiz-lab`에 접속합니다.
2. **Add file → Upload files**에서 압축을 푼 폴더 안의 파일과 `js` 폴더를 저장소 최상위에 업로드합니다.
3. **Commit changes**, GitHub Pages 배포 후 `rooms.html`을 **Ctrl+Shift+R**로 새로고침합니다.
4. **Firebase Realtime Database Rules 수정은 불필요합니다.**

## 변경 파일

- `js/arcade-ui.js` (교사 BGM 자동 시작 / 종료·재생 상태)
- `js/classic-host.js` (첫 문제 시작 시 자동 활성화)
- `js/gold-host.js` (골드 퀘스트 시작 시 자동 활성화)
- `rooms.html` (모듈 캐시 갱신, 버전 표기)
- `index.html`, `join.html`, `sets.html`, `student.html`, `teacher.html`, `loadtest.html` (버전 표기)
- `tests/test-v4-3-autobgm.mjs` (자동 BGM 검사)

**검증 제한:** 브라우저별 오디오 자동 재생 정책과 실제 학교 스피커의 음량은 현장 테스트가 필요합니다.
