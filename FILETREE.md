## ファイル構成

### 📁 プロジェクトルート (設定・ビルド構成)

```text
├── package.json                        # フロントエンド依存関係・スクリプト
├── tsconfig.json                       # TypeScriptコンパイラ設定
├── tsconfig.node.json
├── vite.config.ts                      # Viteビルド設定
├── index.html                          # HTMLエントリーポイント
└── src-tauri/                          # バックエンドプロジェクト (Rust)
    ├── Cargo.toml                      # Rustクレート依存関係
    ├── Cargo.lock
    ├── tauri.conf.json                 # Tauri設定 (ウィンドウ設定・パーミッション等)
    ├── build.rs                        # Tauriビルドスクリプト
    └── capabilities/                   # Tauri v2 権限・ケイパビリティ設定
        └── default.json
```

---

### 📁 フロントエンド (`src/` - React / TypeScript)

```text
src/
├── App.tsx                             # メイン画面 (2ペインおよび各モーダルのレイアウト配置)
├── main.tsx                            # エントリーポイント
├── index.css                           # グローバルスタイル (Tailwind CSS / スタイル定義)
│
├── components/                         # 共通UIコンポーネント
│   ├── Button.tsx
│   ├── Dialog.tsx                      # 確認ダイアログ (上書き確認・削除確認等)
│   ├── ContextMenu.tsx                 # 右クリックメニュー
│   ├── Modal.tsx                       # 汎用モーダル枠
│   └── StatusBar.tsx                   # ステータスバー (選択件数・サイズ合計・エラー表示)
│
├── features/                           # 機能ごとのモジュール
│   ├── explorer/                       # ファイル一覧・ペイン関連 (Phase 2〜3)
│   │   ├── components/
│   │   │   ├── DualPaneContainer.tsx   # 左右2ペインの比率分割・アクティブ制御
│   │   │   ├── Pane.tsx                # 1つのペイン (ヘッダー, リスト, ドライブ切替)
│   │   │   ├── DriveSelector.tsx       # ドライブ切り替えバー (C:, D: 等)
│   │   │   ├── PathBar.tsx             # カレントパス表示・直接入力バー
│   │   │   ├── FileList.tsx            # ファイル一覧テーブル (仮想スクロール対応)
│   │   │   └── FileItem.tsx            # 行要素 (アイコン, 名前, 拡張子, サイズ, 更新日時)
│   │   ├── hooks/
│   │   │   ├── useFileList.ts          # ファイル一覧の取得・ファイル監視イベント連携
│   │   │   ├── useNavigation.ts        # ディレクトリ移動・履歴 (戻る/進む/親へ)
│   │   │   └── useFileSelection.ts     # カーソル移動・複数選択・マーク処理
│   │   └── types.ts                    # FileEntry, PaneState, SortOption等の型定義
│   │
│   ├── operations/                     # ファイル操作・進捗管理 (Phase 3)
│   │   ├── components/
│   │   │   └── TaskProgressModal.tsx   # コピー/移動/削除の非同期進捗バー表示
│   │   ├── hooks/
│   │   │   └── useFileOperations.ts    # コピー・移動・削除・リネーム呼び出し
│   │   └── types.ts                    # TransferProgress, OperationType等の定義
│   │
│   ├── preview/                        # ファイルプレビュー (Phase 5)
│   │   ├── components/
│   │   │   ├── PreviewPane.tsx         # プレビュー表示用コンテナ
│   │   │   ├── TextPreview.tsx         # テキスト/コード表示 (構文強調・文字コード対応)
│   │   │   ├── ImagePreview.tsx        # 画像ビューア
│   │   │   └── BinaryPreview.tsx       # Hexビューア (バイナリ確認用)
│   │   └── hooks/
│   │       └── usePreview.ts           # ファイル読み込み・エンコーディング判定
│   │
│   ├── search/                         # 検索・インクリメンタルフィルタ (Phase 4)
│   │   ├── components/
│   │   │   ├── SearchModal.tsx         # ディレクトリ横断検索ダイアログ
│   │   │   └── QuickFilterBar.tsx      # ペイン内インクリメンタルサーチ入力枠
│   │   └── hooks/
│   │       ├── useSearch.ts            # 再帰的ファイル検索
│   │       └── useQuickFilter.ts       # カレント一覧の絞り込み
│   │
│   ├── keybindings/                    # キーバインド制御 (Phase 6)
│   │   ├── keymap.ts                   # xyzzy/Emacs風キーバインド定義テーブル
│   │   ├── types.ts                    # コマンド識別子・キーストローク型定義
│   │   └── useKeymap.ts                # キー入力キャッチ・プレフィックスキー (C-x 等) 状態管理
│   │
│   └── bookmarks/                      # ブックマーク・お気に入りディレクトリ
│       ├── components/
│       │   └── BookmarkMenu.tsx
│       └── hooks/
│           └── useBookmarks.ts
│
├── hooks/                              # アプリ全体共通のカスタムフック
│   ├── useSettings.ts                  # 設定 (テーマ, 隠しファイル表示等)
│   └── useCommandPalette.ts            # ミニバッファ / コマンド入力用
│
├── services/                           # Tauriの `invoke` / イベントリスナー ラッパー
│   └── tauriApi.ts                     # Rust側コマンド呼び出しの型安全ラッパー
│
├── store/                              # 状態管理 (Zustand)
│   ├── useAppStore.ts                  # ペイン状態 (左右パス, フォーカス), クリップボード
│   └── useTaskStore.ts                 # 実行中の非同期タスク管理
│
└── utils/                              # 補助関数
    ├── formatters.ts                   # 日付・ファイルサイズ・属性フォーマット
    └── path.ts                         # パス結合・親パス取得・Windowsドライブ判定
```

---

### 🦀 バックエンド (`src-tauri/src/` - Rust)

```text
src-tauri/src/
├── main.rs                             # エントリーポイント (`tauri::Builder` 起動)
├── lib.rs                              # モジュール登録と Tauri `.invoke_handler()` 設定
├── error.rs                            # アプリケーション共通のエラー定義 (thiserror, Result型ラッパー)
├── state.rs                            # アプリケーション状態保持 (タスクキャンセルトークン, 設定等)
│
├── commands/                           # Tauri Commands (フロントエンド呼び出し用API)
│   ├── mod.rs
│   ├── fs.rs                           # 一覧取得, ディレクトリ作成, ドライブ一覧
│   ├── ops.rs                          # ファイル操作系 (コピー, 移動, ゴミ箱/完全削除, リネーム)
│   ├── watcher.rs                      # カレントディレクトリ変更監視の開始・停止
│   ├── search.rs                       # 高速ファイル検索
│   ├── preview.rs                      # テキスト/画像/バイナリのプレビューデータ取得
│   └── config.rs                       # 設定ファイルの読み書き・ブックマーク管理
│
└── core/                               # ドメインロジック (OS依存処理・最適化実装)
    ├── mod.rs
    ├── filesystem.rs                   # ファイル入出力, メタデータ取得, ドライブ列挙 (Windows/Unix)
    ├── file_ops.rs                     # キャンセル・進捗イベント通知付きのコピー/移動処理
    ├── watcher.rs                      # notifyクレートを使用したファイル変更検知・イベント送信
    ├── search_engine.rs                # 並列ファイル検索・正規表現/インクリメンタルフィルタ
    └── preview_loader.rs               # 文字コード自動判定・画像サムネイル・Hexダンプ生成
