# 世界中からアクセスできる公開手順（Render）

このプロジェクトは `server.js` を公開して運用します。

## 1. GitHub に push
1. `cd /Users/kessokudaichi/website-imae/exchange-diary`
2. `git add .`
3. `git commit -m "Prepare global deployment"`
4. `git branch -M main`
5. `git remote add origin <あなたのGitHubリポジトリURL>`
6. `git push -u origin main`

## 2. Render でデプロイ
1. Render にログイン
2. `New +` -> `Blueprint` を選択
3. GitHub リポジトリを接続
4. `render.yaml` を読み込んで作成
5. デプロイ完了を待つ

## 3. 動作確認
1. 発行された `https://...onrender.com` を開く
2. `https://...onrender.com/api/health` が `ok: true` を返すことを確認
3. ルーム作成 -> 別デバイスから同URLにアクセスして参加

## 4. 注意点
- 共有URLを知っていれば誰でもアクセス可能です。
- ルームコードの管理が実質的なアクセス制御です。
- 永続ストレージは `render.yaml` で `/var/data` に設定済みです（再起動後も日記が残る）。
