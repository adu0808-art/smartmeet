# SmartMeet — Railway 배포 가이드

본 가이드는 SmartMeet 을 [Railway](https://railway.app) 에 배포하는 절차입니다.
계정: **adu0808@gmail.com**

---

## 사전 준비

### 1. Git 저장소 초기화 (한 번만)

프로젝트 폴더(`M:\SmartMeet`)에서 PowerShell/터미널 열고:

```bash
git init
git add .
git commit -m "Initial commit for Railway deployment"
```

### 2. GitHub 에 저장소 만들기 (권장)

1. GitHub 에 새 비공개 저장소 생성 (예: `smartmeet-prod`)
2. 로컬에 연결 후 푸시:
   ```bash
   git remote add origin https://github.com/<your-username>/smartmeet-prod.git
   git branch -M main
   git push -u origin main
   ```

> **참고**: GitHub 없이 Railway CLI 로 직접 배포도 가능 (아래 "방법 B" 참조).

---

## 방법 A: GitHub 연동 배포 (권장)

### 1. Railway 로그인
- https://railway.app 접속 → `Login with Google`
- **adu0808@gmail.com** 으로 로그인

### 2. 새 프로젝트 생성
- 대시보드 → **New Project** 클릭
- **Deploy from GitHub repo** 선택
- (처음이면) GitHub 연동 권한 허용 → SmartMeet 저장소 선택
- Railway 가 자동으로 `package.json` 감지 → Nixpacks 로 빌드 시작

### 3. 영속 디스크 (Volume) 추가 — **필수!**

SQLite DB 가 컨테이너 재시작 시 사라지지 않도록:

1. 프로젝트 페이지에서 서비스 클릭
2. 상단 탭 → **Settings** → **Volumes** 섹션
3. **+ New Volume** 클릭
4. 설정:
   - **Mount path**: `/data`
   - **Size**: `1 GB` (시작은 작게, 나중에 확장 가능)
5. **Create** 저장

### 4. 환경 변수 설정

서비스 → **Variables** 탭에서 추가:

| 변수명 | 값 | 설명 |
|---|---|---|
| `DB_DIR` | `/data` | 위 Volume 마운트 경로 |
| `JWT_SECRET` | (아래 명령으로 생성) | JWT 서명 시크릿 |
| `NODE_ENV` | `production` | (선택) 프로덕션 모드 |

`JWT_SECRET` 생성:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
출력된 128자 hex 문자열을 복사해 붙여넣기.

> **중요**: `PORT` 변수는 **설정하지 마세요**. Railway 가 자동 주입합니다.

### 5. 첫 배포 확인

- Railway 가 자동으로 빌드 시작 → **Deployments** 탭에서 진행 확인
- 빌드 완료 후 **Settings → Networking → Generate Domain** 클릭
  → `xxxxx.up.railway.app` 형태의 URL 발급
- 해당 URL 접속 → 로그인 페이지 표시되면 성공 ✓

### 6. 첫 관리자 계정 생성

DB 가 비어있으므로 관리자 계정을 만들어야 합니다.

**옵션 1 — 회원가입 후 admin 권한 부여**:
1. 사이트에서 일반 회원가입 (예: `adu0808@gmail.com`)
2. Railway → 서비스 → **Logs** 탭에서 다음 명령 실행을 위한 일회성 셸 필요... → 직접 DB 수정은 어려움
3. 대안: 관리자 자동 생성 코드를 추가 (아래 부록 참조)

**옵션 2 — 기존 로컬 DB 그대로 옮기기** (현재 데이터 유지하고 싶을 때):
1. 서비스 → **Settings** → **Volumes** → 우측 `…` → **Attach to local CLI**
2. 또는 `railway run` 으로 컨테이너 셸 접근 후 SQLite 파일 업로드
3. 자세한 방법: 부록 B 참조

---

## 방법 B: Railway CLI 로 직접 배포 (GitHub 안 씀)

### 1. CLI 설치
```bash
npm install -g @railway/cli
```

### 2. 로그인
```bash
railway login
```
브라우저가 열려 **adu0808@gmail.com** 으로 로그인.

### 3. 프로젝트 생성 + 배포
프로젝트 폴더에서:
```bash
railway init               # 새 프로젝트 생성
railway up                 # 현재 폴더 업로드 + 배포
```

이후 Volume·환경변수 설정은 방법 A 와 동일.

---

## 배포 후 확인

배포 URL 에 접속해 다음을 확인:

- [ ] 로그인 페이지 정상 표시
- [ ] 회원가입 진행 가능
- [ ] 기관 생성 가능
- [ ] 컨테이너 재시작 후에도 데이터 유지 (DB 영속성)
- [ ] 정적 파일(CSS·JS) 로드 성공
- [ ] 콘솔에 `[db] using SQLite path: /data/smartmeet.db` 로그 출력

---

## 부록 A: 관리자 자동 생성 코드 추가 (선택)

배포 환경에서 첫 관리자가 없을 때 환경변수로 시드:

`server/db.js` 끝에 추가:
```js
// 첫 시스템 관리자 자동 생성 (배포 직후 1회)
if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
  const bcrypt = require('bcryptjs');
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.SEED_ADMIN_EMAIL);
  if (!exists) {
    db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
      .run(
        process.env.SEED_ADMIN_EMAIL,
        bcrypt.hashSync(process.env.SEED_ADMIN_PASSWORD, 10),
        process.env.SEED_ADMIN_NAME || 'Admin',
        'admin'
      );
    console.log('[db] 시스템 관리자 시드 생성:', process.env.SEED_ADMIN_EMAIL);
  }
}
```

Railway Variables 에 추가:
- `SEED_ADMIN_EMAIL=adu0808@gmail.com`
- `SEED_ADMIN_PASSWORD=강력한_비밀번호`
- `SEED_ADMIN_NAME=안동욱`

배포 후 첫 시작 시 관리자 계정이 자동 생성됩니다. **로그인 후에는 환경변수에서 SEED_ADMIN_PASSWORD 를 삭제하세요** (보안).

---

## 부록 B: 기존 로컬 DB 옮기기

현재 `M:\SmartMeet\DB\smartmeet.db` 의 데이터를 그대로 사용하고 싶다면:

### 방법 1: Railway CLI 로 파일 업로드

```bash
railway login
railway link <project-id>
railway run --service <service-name> bash
# 컨테이너 셸 진입 후
mkdir -p /data
exit

# 로컬 파일 업로드 (대안 — 직접 SCP 는 안 됨, base64 인라인)
node -e "
  const fs = require('fs');
  console.log(fs.readFileSync('DB/smartmeet.db').toString('base64'));
" > db.b64

railway run --service <service-name> bash -c "
  cat > /data/smartmeet.db.b64 << 'EOF'
$(cat db.b64)
EOF
  base64 -d /data/smartmeet.db.b64 > /data/smartmeet.db
  rm /data/smartmeet.db.b64
"
```

### 방법 2: 정식 마이그레이션 도구 사용

복잡하면 차라리 새로 시작하고 필요한 데이터만 시드 스크립트로 재생성하는 게 깔끔합니다.

---

## 부록 C: 비용

- **Hobby Plan ($5/월)**: 작은 트래픽이면 충분, $5 크레딧 포함
- **Volume 1GB**: 월 ~$0.25
- 총 예상 비용: **월 $5 ~ $10** 수준

---

## 트러블슈팅

### 빌드 실패 — `better-sqlite3` 컴파일 오류
- Nixpacks 가 native 모듈 빌드용 도구를 자동 설치하지만 가끔 실패
- **해결**: `package.json` 에 `"engines": { "node": ">=18.0.0" }` 명시 (이미 적용됨)
- 그래도 실패 시 Dockerfile 사용 권장 (요청 시 작성 가능)

### 컨테이너 재시작 후 DB 비어있음
- Volume 이 마운트되지 않았거나 `DB_DIR` 환경변수 미설정
- Settings → Volumes 와 Variables 양쪽 확인

### 502 Bad Gateway
- 서버가 `process.env.PORT` 를 사용하지 않음 → 코드 확인 (이미 적용됨)
- 빌드는 성공했지만 시작 실패 → Logs 확인

### 로그인 후 즉시 로그아웃
- `JWT_SECRET` 가 매 배포마다 바뀌면 토큰 무효화 됨
- 환경변수에 고정 값 설정 (랜덤이지만 영구 유지)

---

## 요약 체크리스트

- [ ] Git 저장소 초기화·커밋
- [ ] GitHub 에 푸시 (또는 CLI 로 직접)
- [ ] Railway 로그인 (`adu0808@gmail.com`)
- [ ] New Project → Deploy from GitHub repo
- [ ] Volume 추가: `/data` 1GB
- [ ] 환경변수: `DB_DIR=/data`, `JWT_SECRET=<랜덤>`
- [ ] Generate Domain → 접속 확인
- [ ] (선택) `SEED_ADMIN_*` 로 관리자 시드 후 비밀번호 변수 제거

문제 발생 시 Railway → Logs 탭의 에러 메시지를 공유해 주시면 추가 안내드립니다.
