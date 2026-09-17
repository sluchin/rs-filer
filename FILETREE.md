## ファイル構成

### 📁 フロントエンド (`src/` - React / TypeScript)

```text
src/
├── App.tsx                             # メイン画面 (2ペインのレイアウト配置)
├── main.tsx                            # エントリーポイント
├── main.css / index.css                # グローバルスタイル (Tailwind等を使う場合もここ)
│
├── components/                         # 共通UIコンポーネント
│   ├── Button.tsx
│   ├── Dialog.tsx                      # 確認ダイアログ用
│   ├── ContextMenu.tsx                 # 右クリックメニュー
│   └── StatusBar.tsx                   # ステータスバー (エラー表示など)
│
├── features/                           # 機能ごとのモジュール
│   ├── explorer/                       # ファイル一覧・ペイン関連 (Phase 2〜3)
│   │   ├── components/
│   │   │   ├── Pane.tsx                # 1つのペイン（左右の枠組み）
│   │   │   ├── FileList.tsx            # ファイル一覧テーブル/リスト
│   │   │   ├── FileItem.tsx            # リスト内の各行（アイコン＋名前等）
│   │   │   └── PathBar.tsx             # パス入力・移動バー
│   │   ├── hooks/
│   │   │   ├── useFileList.ts          # ファイル一覧の取得・更新
│   │   │   └── useNavigation.ts        # ディレクトリ移動・履歴管理
│   │   └── types.ts                    # FileEntry等の型定義
│   │
│   ├── preview/                        # ファイルプレビュー (Phase 5)
│   │   ├── components/
│   │   │   └── PreviewPane.tsx         # プレビュー表示用コンポーネント
│   │   └── hooks/
│   │       └── usePreview.ts
│   │
│   ├── search/                         # 検索・インクリメンタルサーチ (Phase 4)
│   │   ├── components/
│   │   │   └── SearchModal.tsx
│   │   └── hooks/
│   │       └── useSearch.ts
│   │
│   └── keybindings/                    # キーバインド制御 (Phase 6)
│       └── useKeymap.ts                # xyzzy/Emacs風のキー入力キャッチ
│
├── hooks/                              # アプリ全体共通のカスタムフック
│   ├── useSettings.ts                  # 設定管理
│   └── useCommandPalette.ts            # ミニバッファ / コマンド入力用
│
├── services/                           # Tauriの `invoke` ラッパー
│   └── tauriApi.ts                     # Rust側のコマンドを呼び出す関数群まとめ
│
├── store/                              # 状態管理 (ZustandやContextなど)
│   └── useAppStore.ts                  # アクティブペイン、選択ファイル等のグローバル状態
│
└── utils/                              # 補助関数
    ├── formatters.ts                   # 日付やファイルサイズのフォーマット
    └── path.ts                         # パスの結合・操作ヘルパー
```

### 🦀 バックエンド (`src-tauri/src/` - Rust)

```text
src-tauri/
├── src/
│   ├── commands/              # Tauri Commands（フロントエンドからの窓口）
│   │   ├── mod.rs
│   │   ├── fs.rs              # ファイル操作系コマンド (一覧取得, 読み書き)
│   │   ├── ops.rs             # ファイル管理系コマンド (コピー, 移動, 削除, リネーム)
│   │   ├── search.rs          # 検索・インクリメンタルサーチ系コマンド
│   │   ├── preview.rs         # ファイルプレビュー系コマンド
│   │   └── config.rs          # 設定・ブックマーク系コマンド
│   │
│   ├── core/                  # ドメインロジック（OS依存処理やファイル処理の本体）
│   │   ├── mod.rs
│   │   ├── filesystem.rs      # 標準ライブラリを使ったファイル入出力・メタデータ取得
│   │   ├── search_engine.rs   # 高速ファイル検索・フィルタリング処理
│   │   └── preview_loader.rs  # プレビュー用のテキスト/画像読み込み処理
│   │
│   ├── error.rs               # アプリケーション共通のエラー定義 (thisError等)
│   ├── state.rs               # アプリケーションの状態管理 (アクティブディレクトリ等)
│   ├── lib.rs                 # モジュール登録と Tauri の `.invoke_handler()` 設定
│   └── main.rs                # エントリーポイント (`tauri::Builder` の起動のみ)
```
