# rsfiler 構築・開発環境セットアップガイド

クロスプラットフォーム型ファイルマネージャー **rsfiler**(Tauri v2 + Rust + React + TypeScript)の環境構築手順およびディレクトリ構成の記録です。

---

## 1. 開発環境の要件

* **OS**: Linux (Ubuntu / Debian 系) / macOS / Windows
* **Node.js**: v18 以上 (npm)
* **Rust**: stable toolchain (rustup)
* **環境変数**: Cargo への PATH(`$HOME/.cargo/bin`)が通っていること

---

## 2. 開発環境のセットアップ

### 2.1 Rust のインストール (`rustup`)

Rustの公式ツールチェーンインストーラー `rustup` を使用してインストールします。

#### macOS / Linux の場合

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

```

インストール後、環境変数を反映させます。

```bash
source "$HOME/.cargo/env"

```

※ **Linux (Ubuntu/Debian) の場合:**
Tauri v2 のビルドに必要なシステム依存ライブラリを導入します。

```bash
sudo apt update
sudo apt install build-essential curl wget libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

```

#### Windows の場合

1. [https://rustup.rs/](https://rustup.rs/) から `rustup-init.exe` を取得して実行。
2. C++ Build Tools (Visual Studio) が必要な場合は指示に従って導入。

#### インストールの確認

```bash
rustc --version
cargo --version

```

---

## 3. プロジェクトの初期化と依存管理

### 3.1 パッケージ構成 (`package.json`)

フロントエンドの依存関係およびビルド・Lint スクリプトは `package.json` で管理します。

```bash
# フロントエンド依存ライブラリのインストール
npm install

```

### 3.2 バックエンド開発用 CLI ツール

グローバルで利用する Cargo CLI 拡張ツールを導入します。

```bash
# Cargo パッケージ一括更新ツール (cargo upgrade コマンド用)
cargo install cargo-edit

```

### 3.3 Rust カバレッジツールのインストール(初回のみ)

Rust 側のコードカバレッジ(`npm run coverage`)を測定するには `cargo-tarpaulin` が必要です。**初回セットアップ時のみ**、以下のコマンドを実行してインストールしてください。

```bash
cargo install cargo-tarpaulin

```

---

## 4. プロジェクトのファイル構成

### 4.1 バックエンド(Rust)

マクロ名衝突回避のため、IPC コマンド群は `commands.rs` に分離しています。

* **`src-tauri/src/commands.rs`**
* ディレクトリ走査 (`read_directory`) およびホームディレクトリ取得 (`get_home_dir`) の IPC コマンドを実装。


* **`src-tauri/src/lib.rs`**
* `commands` モジュールを読み込み、Tauri アプリの `invoke_handler` にコマンドを登録。


* **`src-tauri/src/main.rs`**
* エントリポイント。`lib::run()` を呼び出し。



### 4.2 フロントエンド(React + TypeScript)

* **`src/App.tsx`**
* ホームディレクトリを初期表示し、パスの移動やファイル一覧表示を行うメインコンポーネント。
* エラーハンドリング・デバッグログ(`loglevel` / `console`)を含む。


* **`src/test/setup.ts`**
* Vitest および React Testing Library の初期セットアップ設定ファイル。
