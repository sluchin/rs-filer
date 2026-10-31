# rsfiler 構築・開発環境セットアップガイド

クロスプラットフォーム型ファイルマネージャー **rsfiler** (Tauri v2 + Rust + React + TypeScript) の環境構築手順およびディレクトリ構成の記録です。

---

## 1. 開発環境の要件

* **OS**: Linux (Ubuntu / Debian 系) / macOS / Windows
* **Node.js**: v18 以上 (npm)
* **Rust**: stable toolchain (rustup)
* **環境変数**: Cargo への PATH (`$HOME/.cargo/bin`) が通っていること

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

Rust 側のコードカバレッジ (`npm run coverage`) を測定するには `cargo-tarpaulin` が必要です。**初回セットアップ時のみ**、以下のコマンドを実行してインストールしてください。

```bash
cargo install cargo-tarpaulin

```

---

## ログ

ログは、標準エラー出力と、ログファイルに出ます。フロントエンド (`loglevel`) のログも、バックエンドに転送して、同じファイルに残します。フロントエンドのログは、200ms ごとにまとめて転送します (エラーはすぐに転送します)。1 件は 4000 文字までで、改行などの制御文字は `\n` のようにエスケープして、1 行で記録します。

1 行は `2026-10-25T09:25:31.123+09:00 [INFO]  commands/app.rs:42 アプリケーション終了` のように、時刻 (ローカル時刻、ミリ秒まで)、レベル、出力元、内容の順に並びます。出力元は、アプリのログは `src/` からのファイルのパスと行番号、外部のクレートのログは `クレート名/ファイル名:行番号` (`tao/mod.rs:120` など)、フロントエンドのログは `front/<機能名>` (`front/explorer` など。機能名は `loglevel.getLogger("explorer")` で付けた名前) です。フロントエンドのログの時刻は、バックエンドが書き込んだ時刻ではなく、フロントエンドでログを出した時刻です。まとめて転送するため、ファイルの中で、前後の行と最大 200ms ほど順番が入れ替わることがあります。時刻の順に並べ直すときは、`LC_ALL=C sort rsfiler.log` を使います (書式がそろっているので、行の先頭で並べれば時刻の順になります)。

* ログファイル: `<データディレクトリ>/rsfiler/logs/rsfiler.log` (Linux は `~/.local/share/rsfiler/logs/rsfiler.log`、Windows は `%LOCALAPPDATA%\rsfiler\logs\rsfiler.log`、macOS は `~/Library/Application Support/rsfiler/logs/rsfiler.log`)。5 MB を超えると世代送りして、3 世代 (`.1` から `.3`) を残します。
* レベル: デバッグ版 (`npm run tauri:dev`) はデバッグ以上、リリース版 (`npm run tauri:build`) は情報、警告、エラーを出します。
* レベルを変えるとき: `RUST_LOG=debug npm run tauri:dev` のように、環境変数 `RUST_LOG` で上書きします (リリース版でも効きます)。

## 4. プロジェクトのファイル構成

### 4.1 バックエンド (Rust)

マクロ名衝突回避のため、IPC コマンド群は `commands/` モジュールに分離しています。

* **`src-tauri/src/commands/`**
* `fs.rs`: ディレクトリ走査 (`read_directory`。走査自体は `spawn_blocking` で別スレッド実行し、IPC を処理するスレッドを塞がない)、ホームディレクトリ取得 (`get_home_dir`)、ドライブ一覧、ディスク容量。
* `ops.rs`: 作成・名前変更。
* `config.rs`: 設定ファイルの読み書き (`keymap.json` の読み込み、`config.json` のテーマ・フォントサイズ・エディタ・ターミナル・ウィンドウの状態の読み書き)。
* `window_state.rs`: ウィンドウの大きさ・位置・最大化の状態を、終了時に `config.json` の `window` へ保存して、起動時に復元する (保存と復元の判断は、Tauri に依存しない関数)。Linux の Wayland では、位置を取得も設定もできないため、起動時に `GDK_BACKEND=x11` を設定して、XWayland で動かす (`GDK_BACKEND` を自分で指定している場合や、`DISPLAY` が無い場合は、設定しない)。
* `app.rs`: アプリケーションの終了。
* `transfer.rs`: コピー・移動・削除 (別スレッドで実行し、進捗を Channel で通知。中断に対応)。
* `preview.rs`: テキスト・画像・バイナリのプレビュー。
* `info.rs`: ファイル・ディレクトリの詳細 (サイズ・日時・権限など) と、ディレクトリの配下の合計 (別スレッドで数え、新しい要求で前の計算を中断する)。
* `open.rs`: 関連付けアプリ・エディタで開く、ターミナルを開く。
* `exec.rs`: 選択したファイルに対する外部コマンドの実行 (`%f` をパスに置換)。


* **`src-tauri/src/lib.rs`**
* `commands` モジュールのコマンドを `specta_builder` (tauri-specta) で集め、Tauri アプリの `invoke_handler` に登録。フロントエンドの型 (`src/bindings.ts`) は `npm run bindings:generate` で作る。


* **`src-tauri/src/main.rs`**
* エントリポイント。`lib::run()` を呼び出し。



### 4.2 フロントエンド (React + TypeScript)

* **`src/App.tsx`**
* ホームディレクトリを初期表示し、パスの移動やファイル一覧表示を行うメインコンポーネント。
* エラーハンドリング・デバッグログ (`loglevel` / `console`) を含む。


* **`tests/setup.ts`**
* Vitest および React Testing Library の初期セットアップ設定ファイル。
