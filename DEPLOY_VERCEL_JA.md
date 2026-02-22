# Vercel運用手順（この構成向け）

このプロジェクトは以下で動きます。
- フロント: `public/index.html` + `public/app.js`
- API: Next.js Route Handlers (`app/api/...`)
- データ: Vercel KV（Upstash）
- 画像/動画: Vercel Blob

## 1. Vercelでプロジェクト作成
1. Vercelにログイン
2. `Add New` -> `Project`
3. `unitydai0310-hub/exchange-diary` を Import
4. Framework Preset は `Next.js`
5. Deploy

## 2. Storageを接続
Vercelダッシュボードの `Storage` から追加:
- KV（Upstash）
- Blob

接続後、環境変数が自動追加されます。

## 3. 必須環境変数
`Project Settings -> Environment Variables` で追加:
- `AUTH_SECRET` : ランダム文字列（32文字以上）

KV/Blob は連携時に自動投入される前提:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `BLOB_READ_WRITE_TOKEN`

## 4. 再デプロイ
環境変数追加後に再デプロイ。

## 5. 動作確認
- `https://<your-domain>/api/health`
- `https://<your-domain>/index.html`

## 6. 備考
- ルート `/` は `/index.html` へリダイレクトします。
- 1日1人1件、リアクション、3人抽選担当に対応済みです。
