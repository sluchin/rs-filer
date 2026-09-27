# プロジェクト設定

rsfiler は、xyzzy のファイラを参考にした、キーボード操作優先の 2 ペイン ファイラ。Tauri v2 (バックエンド: Rust、フロントエンド: React 19 / TypeScript / Vite) で作る。

## コマンド

すべてリポジトリのルートで実行する (`package.json` の scripts)。

- 開発起動: `npm run tauri dev`
- ビルド: `npm run build` (フロントエンド: `tsc && vite build`)。配布用の Tauri ビルドは `npm run tauri build`。
- 整形チェック: `npm run format:check` (prettier)。整形の適用は `npm run format` (prettier + `cargo fmt`)。
- 静的解析: `npm run lint` (eslint + `cargo clippy`)。自動修正は `npm run lint:fix` (eslint のみ)。
- テスト: `npm run test` (`vitest run` と `cargo test`)。
  - フロントエンドのみ: `npx vitest run`。特定のファイルのみ: `npx vitest run src/tests/App.test.tsx`。
  - バックエンドのみ: `cd src-tauri && cargo test`。
- カバレッジ: `npm run coverage` (フロントエンドは vitest / v8、バックエンドは `cargo tarpaulin`)。
- 一括チェック: `npm run check` (`format:check` → `lint` → `test` → `cargo fmt --check`)。
- ドキュメント生成: `npm run doc` (フロントエンドは typedoc で `docs/fe`、バックエンドは `cargo doc`)。

## プロジェクト構成

- `src/`: フロントエンド (React / TypeScript)。テストは `src/tests/` に置く (`setup.ts` は vitest の setupFiles)。
- `src-tauri/`: バックエンド (Rust)。
  - `src/lib.rs`: Tauri の初期化と IPC ハンドラーの登録 (`run`)。
  - `src/commands.rs`: フロントエンドから呼ぶ IPC コマンド (`#[tauri::command]`)。
  - `src/main.rs`: エントリポイント。
  - `tests/`: 結合テスト (`commands_test.rs`)。
  - `capabilities/default.json`: Tauri v2 の権限設定。
- `FILETREE.md`: 目標とするファイル構成 (`components/`、`features/` など、まだ存在しないものを含む)。
- `TODO.md`: フェーズごとのロードマップ。
- `KEYBINDINGS.md`: キーバインド仕様。
- `README.md` / `INSTALL.md` / `SETUP.md`: 利用者・開発者向けの文書。
- `.github/workflows/release.yml`: `v*` タグの push で、3 OS 向けにビルドして GitHub Releases にドラフトを作る。
- `dist/`、`coverage/`、`docs/`、`node_modules/`、`src-tauri/target/` は生成物。編集しない。

## コードの構成規約

### 共通

- フロントエンドとバックエンドは、Tauri の IPC (`invoke` とコマンド) だけで結ぶ。コマンドの名前・引数・戻り値を変えるときは、`src-tauri/src/commands.rs`、`src-tauri/src/lib.rs` の `generate_handler!`、フロントエンドの `invoke` 呼び出し、両方のテストを、まとめて直す。
- Rust の構造体を IPC で返すときは、`serde::Serialize` を派生する。フロントエンドの型 (`FileEntry` など) は、そのフィールド名 (`is_dir` のようなスネークケース) に合わせる。
- 新しく IPC コマンドを追加したら、`lib.rs` の `generate_handler!` に登録する。ファイルシステムやシェルなどのプラグインを使う場合は、`capabilities/default.json` の権限も追加する。
- ドキュメントコメントは日本語で書く。文末は「.」を使う既存の書き方に合わせる (`/// ... します.`、`* @param` など)。
- コメントに、`// ---` や `// ===` のような、装飾の記号を入れない。

### バックエンド (Rust)

- 公開する関数・構造体には、`///` のドキュメントコメントを付ける。引数がある場合は `# Arguments`、戻り値がある場合は `# Returns`、パニックしうる場合は `# Panics` の節を書く。
- IPC コマンドは、`Result<T, String>` を返す。エラーは、呼び出し側 (フロントエンド) で表示できる文字列にする。
- ロジックは、Tauri のランタイムに依存しない関数として書き、`cargo test` で検証できるようにする。`tauri::Builder` の起動部分 (`run`) のように、テストできない部分だけを `#[cfg(not(tarpaulin_include))]` でカバレッジから除外する。
- `unwrap()` / `expect()` は、実行時のコード (`src`) では避け、エラーを `Result` で返す。テストでは使ってよい。
- 依存クレートは、`src-tauri/Cargo.toml` に追加する。テストだけで使うものは `[dev-dependencies]` に置く。

### フロントエンド (TypeScript / React)

- 関数コンポーネントとフックで書く。型は `any` を避け、明示する。コンポーネントの戻り値の型は `ReactElement`。
- 公開する型・関数・コンポーネントには、TSDoc (`/** ... */`) を付ける (typedoc で出力する)。
- Tauri の API は `@tauri-apps/api` から取り込む。バックエンドの呼び出しは、`invoke` を通す。
- ログは `console.*` ではなく `loglevel` (`log.debug` / `log.warn` / `log.error`) を使う。
- キーボード操作を優先する。キーバインドを足すときは、`KEYBINDINGS.md` の既存の割り当てと衝突しないことを確認する。
- `FILETREE.md` の構成 (`components/`、`features/<機能>/{components,hooks,types.ts}`) に沿って、ファイルを分ける。コードが `App.tsx` に集中してきたら、この構成へ切り出す。

## テストの規約

### Rust

- 単体テストは、対象のソースと同じファイルの `#[cfg(test)] mod tests` に置く。`src-tauri/tests/` の結合テストは、公開 API (`rsfiler::commands::*`) だけを使う。
- テスト関数名は `test_<対象の関数名>_<内容>` とする (`test_read_directory_integration`)。
- ファイルシステムを使うテストは、`tempfile` の一時ディレクトリを使い、実際のホームディレクトリなどを変更・削除しない。
- 同じ挙動を検証する、重複したテストは作らない。

### フロントエンド (vitest)

- テストは `src/tests/` に置く。ファイル名は、対象のソースのファイル名に `.test` を付ける (`App.tsx` → `App.test.tsx`)。
- `@tauri-apps/api/core` の `invoke` は、`vi.mock` でモックする。テストから、実際の Tauri のバックエンドやファイルシステムへ接続しない。
- `describe` で対象 (コンポーネント・フック・関数) をまとめ、`it` の説明は、日本語で「正常系: ...」「異常系: ...」のように、何を検証するか分かるようにする。
- 各テストの前に `vi.clearAllMocks()` を呼び、テスト間でモックの状態を持ち越さない。
- ユーザー操作は、`@testing-library/user-event` で再現する。

## 開発ルール

- コードの修正後は必ず `npm run build` `npm run check` を実行し、エラーが出なくなるまで修正を繰り返すこと。
  - `npm run check` は、整形チェック・eslint・clippy・vitest・cargo test・`cargo fmt --check` を含む。整形で失敗したら、`npm run format` で直してから、もう一度実行する。
  - Rust だけ変更した場合でも、フロントエンドの型と IPC の整合を確認するため、`npm run check` は省略しない。
  - **例外**: 変更が Markdown ファイル (`*.md`) のみの場合は、上記のコマンドを実行しない。
- 機能追加・修正には、テストを追加する (フロントエンドは vitest、バックエンドは cargo test)。カバレッジは下げない (`npm run coverage` で確認する)。到達できないコードは削除する。カバレッジからの除外 (`tarpaulin_include`、vitest の `coverage.exclude`) は、エントリポイントや、テストできない起動処理に限り、理由をコメントで添えて使う。
- キーバインドや操作を変更したら、`KEYBINDINGS.md` と `README.md` も更新する。フェーズの進捗が変わったら `TODO.md`、ファイル構成が変わったら `FILETREE.md` も更新する。
- `package.json` の `version`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` のバージョンは、勝手に変更しない (リリースの操作は、ユーザーが行う)。
- `package-lock.json` と `Cargo.lock` は、依存を変更したときだけ更新する。

### 完了条件・タスク完了時の動作

- 修正や機能追加が完了し、ビルドやテストが全て成功したら、以下の手順を実施してタスクを終了すること：
  1. `git diff --stat` を実行して必要に応じて主要ファイルの差分を確認すること。
  2. 修正内容のサマリー（変更点と理由の簡潔なまとめ）をユーザーに報告する。
- ユーザーに依頼されない限り、`git commit` / `git push` は行わない。
