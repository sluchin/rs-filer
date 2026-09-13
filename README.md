# rsfiler

Tauri v2 + Rust + React + TypeScript で構築するクロスプラットフォーム対応のモダンなファイルマネージャーです。

## 技術構成

- **GUI / OS Bridge**: Tauri v2
- **Backend Logic**: Rust
- **Frontend Framework**: React (TypeScript, Vite)
- **Logging**: loglevel (Frontend)

## クイックスタート

詳細な環境構築手順や設計方針については [SETUP.md](./SETUP.md) を、ビルドやインストール手順については [INSTALL.md](./INSTALL.md) を参照してください。

```bash
# 依存関係のインストール
npm install

# 開発起動
npm run tauri dev

```

---

## アプリケーションの起動とデバッグ

### 1. 開発モードの起動

```bash
npm run tauri dev

```

### 2. 画面（フロントエンド）ログの確認手順

1. 起動した Tauri ウィンドウ上で **右クリック**
2. **「検証 (Inspect)」** を選択
3. **Console** タブを開き、出力を確認

### 3. Webサーバーなし（ビルド済み静的ファイル）で起動する場合

```bash
npm run build
npx tauri dev --no-dev-server

```

---

## テストおよびコード品質の検証

プロジェクトの品質を維持するため、単体テスト、コードフォーマット、リンターの一括チェック、カバレッジ測定、および API ドキュメント生成コマンドを用意しています。

### 1. 全体一括チェック（推奨）

コードフォーマット、Lint、フロントエンドおよびバックエンドのテストをまとめて一括実行します。プルリクエスト作成前やコミット前の最終確認に使用します。

```bash
npm run check

```

### 2. 単体テストの実行

Vitest (フロントエンド) と `cargo test`（バックエンド）を実行します。

```bash
# フロントエンドおよび Rust の単体テストを一括実行
npm run test

# フロントエンドのウォッチモード起動（ファイル変更時に自動再実行）
npm run test:watch

```

### 3. コードカバレッジの測定

フロントエンド（Vitest v8）およびバックエンド（`cargo-tarpaulin`）のカバレッジを出力します。

```bash
# 通常実行 (キャッシュを利用して高速測定)
npm run coverage

# クリーン実行 (中間生成物をクリアして完全に正確なカバレッジを出力)
npm run coverage:clean

```

※ Rust 側のカバレッジを出力するには、初回のみ `cargo install cargo-tarpaulin` の実行が必要です。

### 4. コードフォーマットの自動修正

Prettier および `cargo fmt` を使用してコードスタイルを自動整列します。

```bash
npm run format

```

### 5. API ドキュメントの生成

フロントエンド (TypeDoc) およびバックエンド (`cargo doc`) のソースコード注釈 (TSDoc / RustDoc) から HTML 仕様書を自動生成します。

```bash
# フロントエンドとバックエンドのドキュメントを一括生成
npm run doc

# フロントエンド (React / TypeScript) のドキュメント生成
npm run doc:fe

# バックエンド (Rust) のドキュメント生成
npm run doc:be

# バックエンドのドキュメントを生成してブラウザで表示
npm run doc:be:open

```

※ `CARGO_TARGET_DIR` を分離してドキュメントをビルドするため、依存ライブラリの再チェックを回避し高速に生成されます。

---

## バージョン管理 (バージョンバンプ)

アプリのバージョン (パッチバージョン) を繰り上げる場合の手順です。

```bash
npm version patch --no-git-tag-version

```

※ `package.json` 更新後、`src-tauri/tauri.conf.json` および `src-tauri/Cargo.toml` の `version` も手動で統一してください。

---

## 依存ライブラリの更新手順

本プロジェクトは Front-end（npm）と Back-end（Cargo）の 2 つのパッケージマネージャーを使用します。目的に応じて以下の手順で更新します。

---

### 1. フロントエンド (npm / TypeScript / React)

#### 更新レベルの選択

```
【定期メンテナンス】
   └─ パターン A: npm update (推奨)

【package.json のバージョン表記を最新化】
   ├─ パターン B: マイナー更新 (npx npm-check-updates -t minor -u)
   └─ パターン C: メジャー更新 (npx npm-check-updates -u)

```

---

#### パターン A: 定期メンテナンス (推奨)

`package.json` のバージョン指定範囲内 (例: `^1.2.0`) で、安全に最新化します (`package.json` は変更されません) 。

```bash
# 1. 更新可能なパッケージの確認
npm outdated

# 2. 依存ライブラリの更新
npm update

```

---

#### パターン B: `package.json` のマイナーバージョン底上げ

`package.json` に記載されているバージョン表記自体 (例: `"eslint": "^9.20.0"` → `"eslint": "^9.21.0"`) を互換性のある最新版へ底上げします。

```bash
# 1. 互換性のある範囲で package.json を書き換え
npx npm-check-updates -t minor -u

# 2. パッケージの再インストール
rm -rf node_modules package-lock.json
npm install

```

---

#### パターン C: 破壊的変更を含むメジャーアップデート

最新の主要バージョン (例: React 18 → 19 等) へ一括更新します。

```bash
# 1. package.json を絶対最新バージョンへ書き換え
npx npm-check-updates -u

# 2. パッケージの再インストール
rm -rf node_modules package-lock.json
npm install

```

---

### 2. バックエンド (Cargo / Rust)

```bash
# マイナー・パッチ更新 (Cargo.lock のみ更新)
cd src-tauri && cargo update

# 個別パッケージの最新化・追加 (例: serde)
cd src-tauri && cargo add serde --features derive

# 全パッケージの一括メジャーアップデート (要 cargo-edit)
cd src-tauri && cargo upgrade

```

---

### 3. 更新後の必須チェック

更新完了後は、型チェック・フォーマット・テストが一括で通過するか確認します。

```bash
# Lint・フォーマット・テストの一括実行
npm run check

# 動作確認
npm run tauri dev

```
