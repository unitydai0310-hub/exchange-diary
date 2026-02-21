# Oracle Cloud Always Freeで公開する手順

この手順で、PCがOFFでも世界中からアクセスできる公開URLを作れます。

## 1. OCIでVMを作成
1. Oracle Cloudにログイン
2. Compute -> Instances -> Create instance
3. Always Free対象の形状を選択
4. Public IPv4を有効化
5. SSH鍵を設定して作成

## 2. OCIネットワークでポート開放
Security List（またはNSG）で以下を許可
- TCP 22（SSH）
- TCP 5173（アプリ）

## 3. VMにSSH接続
```bash
ssh -i <秘密鍵ファイル> ubuntu@<VMのパブリックIP>
```

## 4. 自動セットアップ実行
```bash
curl -fsSL https://raw.githubusercontent.com/unitydai0310-hub/exchange-diary/main/deploy/oracle/install.sh -o install.sh
chmod +x install.sh
sudo bash install.sh https://github.com/unitydai0310-hub/exchange-diary.git
```

## 5. 動作確認
VM内:
```bash
curl http://127.0.0.1:5173/api/health
```
ブラウザ（どこからでも）:
```text
http://<VMのパブリックIP>:5173
```

## 6. 更新デプロイ
アプリ更新後はVM内で:
```bash
cd /opt/exchange-diary
sudo bash /opt/exchange-diary/deploy/oracle/install.sh https://github.com/unitydai0310-hub/exchange-diary.git
```

## 注意
- HTTPSを使う場合は、Nginx + Let's Encryptを後から追加してください。
- 無料枠はリージョンや空き状況で作成不可の時間帯があります。
