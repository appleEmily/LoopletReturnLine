# Looplet for LINE

LINE公式アカウント / LIFF から、店舗のLooplet返却申請をDashboardへ送信するアプリです。

## できること

- LIFF内で返却ブランド、店舗、返却数、備考を入力
- スマホの背面カメラで返却写真を撮影
- `multipart/form-data` でDashboardの `POST /api/return-requests` へ転送
- Dashboardと別ドメインで運用してもCORSを避けるため、同一オリジンの `/api/return-requests` がプロキシします

## 必要な環境変数

`.env.example` を `.env.local` にコピーして設定してください。

```env
LOOPLET_DASHBOARD_BASE_URL=https://looplet-dashboard.chom.co.jp
LOOPLET_API_KEY=
NEXT_PUBLIC_LIFF_ID=2010592661-EVu2Jvrs
NEXT_PUBLIC_DEFAULT_BRAND_NAME=chom Inc.
NEXT_PUBLIC_DEFAULT_LOCATION_NAME=
```

`LOOPLET_API_KEY` はDashboard側に認証を追加した場合に使う想定です。現在共有されたDashboard APIには認証がないため、未設定でも送信できます。

## 店舗ごとのLIFF URL

LIFF Endpoint URL:

```text
https://celebrated-dango-1805b4.netlify.app/
```

Dashboardの `locations.id` を `locationId` としてURLに付けて開きます。

```text
https://celebrated-dango-1805b4.netlify.app/?locationId=<locations.id>&locationName=<店舗名>&brandName=<ブランド名>
```

例:

```text
https://celebrated-dango-1805b4.netlify.app/?locationId=019f...&locationName=豊洲ららぽーと6F&brandName=chom%20Inc.
```

`locationId` はDashboard APIで必須です。`locationName` と `brandName` はLINE画面表示用です。

## 開発

```bash
npm install
npm run dev
```

ローカル確認:

```text
http://localhost:3000/?locationId=<Dashboardのlocations.id>&locationName=テスト店舗&brandName=chom%20Inc.
```

カメラはHTTPSまたはlocalhostでのみ利用できます。LIFF本番URLはHTTPSで公開してください。

## Dashboard連携仕様

送信先は共有Dashboardの `POST /api/return-requests` です。

- `locationId`: 返却元拠点ID
- `loopletQuantity`: 返却数
- `remarks`: 備考。LIFFプロフィールが取得できた場合はLINE表示名とuserIdを追記
- `images`: 撮影写真。Dashboard仕様に合わせて1ファイル10MB以下

## LINE側で必要な情報

- LIFF ID
- LIFF Endpoint URLに設定する公開URL
- 店舗ごとの `locations.id`
- LINEリッチメニューやトーク導線で開く店舗別URL
