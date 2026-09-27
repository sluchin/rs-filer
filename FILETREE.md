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
│   ├── Minibuffer.tsx                  # 画面下部の入力領域 (作成・名前変更・確認・ドライブ選択・M-x を表示)
│   ├── Dialog.tsx                      # 確認ダイアログ (上書き確認・削除確認等)
│   ├── ContextMenu.tsx                 # 右クリックメニュー
│   ├── Modal.tsx                       # 汎用モーダル枠
│   ├── OperationLogDialog.tsx          # 操作ログの表示
│   ├── KeyHintBar.tsx                  # 画面下部のキー操作案内
│   └── StatusBar.tsx                   # ステータスバー (カーソル位置の名前・ディスク空き容量・エラー表示)
│
├── features/                           # 機能ごとのモジュール
│   ├── explorer/                       # ファイル一覧・ペイン関連 (Phase 2〜3)
│   │   ├── components/
│   │   │   ├── DualPaneContainer.tsx   # 左右2ペインの比率分割・アクティブ制御
│   │   │   ├── Pane.tsx                # 1つのペイン (ヘッダー, リスト, ドライブ切替)
│   │   │   ├── DriveSelector.tsx       # ドライブ切り替えバー (C:, D: 等)
│   │   │   ├── PathBar.tsx             # カレントパス表示・直接入力バー (Tab でパス補完)
│   │   │   ├── FileList.tsx            # ファイル一覧テーブル (仮想スクロール対応)
│   │   │   ├── FileItem.tsx            # 行要素 (アイコン, 名前, 拡張子, サイズ, 更新日時)
│   │   │   └── HistoryPane.tsx         # ペインの表示をディレクトリ移動履歴の一覧に差し替えるビュー
│   │   ├── hooks/
│   │   │   ├── useFileList.ts          # ファイル一覧の取得・ファイル監視イベント連携
│   │   │   ├── useDiskSpace.ts         # アクティブペインのディスク空き容量の取得
│   │   │   ├── useNavigation.ts        # ディレクトリ移動・履歴 (戻る/進む/親へ)
│   │   │   ├── useMarks.ts             # マーク (複数選択) 処理
│   │   │   └── useVirtualRows.ts       # 仮想スクロール (表示範囲の計算・スクロール追従)
│   │   ├── view.ts                     # 隠しファイル除外・絞り込み・ソート・パターン一致
│   │   └── types.ts                    # FileEntry, PaneState, SortOption等の型定義
│   │
│   ├── operations/                     # ファイル操作・進捗管理 (Phase 3)
│   │   ├── components/
│   │   │   ├── OperationDialog.tsx         # 名前入力・確認ダイアログ (作成/リネーム/削除)
│   │   └── TaskProgressModal.tsx   # コピー/移動/削除の非同期進捗バー表示
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
│   │   ├── keymap.ts                   # キー列とコマンドの対応表・解決 (プレフィックスキー含む)
│   │   ├── commandNames.ts             # コマンドパレット用の名前・別名・説明
│   │   ├── types.ts                    # コマンド識別子・キーストローク型定義
│   │   ├── useKeymap.ts                # キー入力キャッチ・入力途中のキー列の状態管理
│   │   ├── hooks/
│   │   │   └── useUserKeymap.ts        # 設定ファイルによるキーマップ上書きの読み込み
│   │   └── components/
│   │       ├── CommandPalette.tsx      # M-x / : コマンドパレット (ミニバッファ, 候補一覧は表示しない)
│   │       └── HelpDialog.tsx          # ? / :help のコマンド一覧 (キー割り当て・説明)
│   │
│   ├── bookmarks/                      # ブックマーク・お気に入りディレクトリ
│   │   ├── components/
│   │   │   └── BookmarkPane.tsx        # ペインの表示をブックマーク一覧に差し替えるビュー
│   │   └── hooks/
│   │       └── useBookmarks.ts
│   │
│   └── settings/                       # アプリ設定 (Phase 7)
│       └── types.ts                    # AppConfig, Theme, FontSize と, 切り替え順
│
├── hooks/                              # アプリ全体共通のカスタムフック
│   ├── useSettings.ts                  # 設定の読み込み・保存 (テーマ・フォントサイズの切り替え)
│   ├── useHistoryNav.ts                # ミニバッファの入力履歴参照
│   ├── useNotice.ts                    # 完了通知の一定時間表示
│   └── useOperationLog.ts              # 操作ログの保持
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
│   ├── fs.rs                           # 一覧取得, ホームディレクトリ, ドライブ一覧, ディスク容量
│   ├── ops.rs                          # ディレクトリ/ファイル作成, リネーム
│   ├── transfer.rs                     # コピー/移動/ゴミ箱・完全削除 (進捗通知・中断対応)
│   ├── open.rs                         # 関連付けアプリ・エディタで開く, ターミナルを開く
│   ├── exec.rs                         # 選択したファイルに対する外部コマンドの実行
│   ├── watcher.rs                      # カレントディレクトリ変更監視の開始・停止
│   ├── search.rs                       # 高速ファイル検索
│   ├── preview.rs                      # テキスト(文字コード自動判別)/画像/バイナリのプレビューデータ取得
│   ├── config.rs                       # 設定ファイルの読み書き (keymap.json / config.json)
│   └── app.rs                          # 終了 (quit_app)
│
└── core/                               # ドメインロジック (OS依存処理・最適化実装)
    ├── mod.rs
    ├── filesystem.rs                   # ファイル入出力, メタデータ取得, ドライブ列挙 (Windows/Unix)
    ├── file_ops.rs                     # キャンセル・進捗イベント通知付きのコピー/移動処理
    ├── watcher.rs                      # notifyクレートを使用したファイル変更検知・イベント送信
    ├── search_engine.rs                # 並列ファイル検索・正規表現/インクリメンタルフィルタ
    └── preview_loader.rs               # 文字コード自動判定・画像サムネイル・Hexダンプ生成
