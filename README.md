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

## 依存ライブラリの更新手順

本プロジェクトでは、フロントエンド（npm / Node.js）とバックエンド（Cargo / Rust）の 2 つのパッケージマネージャーを使用しています。定期的に以下の手順で依存関係を最新に保ちます。

### 1. フロントエンド（TypeScript / React）の更新

結論から言うと、**`npm update` が最も安全です**。

---

### 理由（`npm update` vs `npx npm-check-updates -t minor -u`）

| コマンド | 特徴 | 安全性 |
| --- | --- | --- |
| **`npm update`** | `package.json` に書かれたバージョン指定（例: `^1.2.0`）を守ったまま、`package-lock.json` 内の範囲内最新版に更新します。**`package.json` 自体は書き換えません**。 | **最高（最安全）** |
| **`npx npm-check-updates -t minor -u`** | `package.json` 内のキャレット記号（`^`）のベース数値そのものを書き換えて更新します。 | **中（比較的安全）** |

---

### それぞれの役割と使い分け

1. **`npm update`（普段の日常メンテナンス）**
* **安全性**: ★★★★★
* **用途**: `package.json` で定義した「このメジャーバージョン内ならOK」という約束を守りつつ、バグ修正やマイナーアップデートを取り込みます。意図しないバージョン跳躍が起きないため、最も安全です。


2. **`npx npm-check-updates -t minor -u`（`package.json` の表記自体を新しくしたい時）**
* **安全性**: ★★★★☆
* **用途**: `package.json` の記述自体（例: `"eslint": "^9.20.0"` → `"eslint": "^9.21.0"`）を最新のマイナー版へ底上げしたい場合に使います。

---

#### 1. 最も安全な更新（日常のメンテナンス）

`package.json` の範囲内で、安全に依存ライブラリを最新化します（`package.json` は変更されません）。

```bash
# 更新可能なパッケージの確認
npm outdated

# 依存ライブラリの更新
npm update

```

#### 2. package.json の記述を含めたマイナー更新

`package.json` に記載されているバージョン表記自体を、互換性のある最新のマイナー/パッチバージョンへ更新します。

```bash
# 互換性のある範囲で package.json を更新
npx npm-check-updates -t minor -u

# パッケージの再インストール
rm -rf node_modules package-lock.json
npm install

```

#### 3. メジャーバージョンの更新

破壊的変更を含む可能性がある最新メジャーバージョンへ更新します。

```bash
# package.json を絶対最新バージョンへ書き換え
npx npm-check-updates -u

# パッケージのインストール
npm install

```

### 2. バックエンド（Rust / Cargo）の更新

#### 安全な更新（マイナー・パッチバージョンの更新）

`Cargo.toml` の条件を満たす範囲で `Cargo.lock` を更新します。

```bash
cd src-tauri
cargo update

```

#### 個別パッケージの最新化 / 追加

特定のパッケージを最新版へ更新・追加する場合は、`cargo add` を実行します（crates.io から最新版が自動取得されます）。

```bash
cd src-tauri
cargo add serde --features derive
cargo add dirs

```

#### 全パッケージの一括メジャーアップデート

`Cargo.toml` に記載されているすべての依存関係を最新にする場合は `cargo-edit` ツールの `cargo upgrade` を使用します。

```bash
# ツールの導入（初回のみ）
cargo install cargo-edit

# 全パッケージのバージョン記述を最新に更新
cd src-tauri
cargo upgrade

```

---

### 3. 更新後の動作確認・チェック

アップデート完了後は、静的解析・型チェック・ビルドが問題なく通過するか必ず確認します。

```bash
# Lint とフォーマットのチェック（フロントエンド & Rust）
npm run check

# 開発サーバー起動テスト
npm run tauri dev

```
