# rsfiler インストールガイド

クロスプラットフォーム型ファイルマネージャー **rsfiler** のパッケージ作成（ビルド）および各 OS へのインストール手順です。

---

## 1. インストールパッケージの生成（ビルド）

プロジェクトのルートディレクトリで以下のコマンドを実行すると、ご使用の OS に合わせたインストーラー・パッケージが自動生成されます。

```bash
npm run tauri build

```

生成されたパッケージは **`src-tauri/target/release/bundle/`** 配下に各フォーマットごとに格納されます。

---

## 2. OS 別のインストール手順

### 2.1 Linux (Ubuntu / Debian 系)

`npm run tauri build` を実行すると、`.deb` パッケージおよび `.AppImage` が生成されます。

#### A. `.deb` パッケージからインストール（推奨）

```bash
# 生成された deb パッケージのインストール
sudo dpkg -i src-tauri/target/release/bundle/deb/rsfiler_*_amd64.deb

# 依存関係でエラーが出る場合は修復を実行
sudo apt-get install -f

```

インストール後、ターミナルから `rsfiler` で起動するか、デスクトップ環境のアプリケーションメニューから起動できます。

#### B. `.AppImage` から直接実行（ポータブル版）

インストールせずに直接実行したい場合に便利です。

```bash
# 実行権限の付与
chmod +x src-tauri/target/release/bundle/appimage/rsfiler_*_amd64.AppImage

# 実行
./src-tauri/target/release/bundle/appimage/rsfiler_*_amd64.AppImage

```

---

### 2.2 macOS

`npm run tauri build` を実行すると、`.dmg` ディスクイメージおよび `.app` アプリケーションバンドルが生成されます。

#### インストール手順

1. `src-tauri/target/release/bundle/dmg/` 配下にある `.dmg` ファイルをダブルクリックして開きます。
2. アプリケーションアイコン（`rsfiler`）を **Applications** フォルダーへドラッグ＆ドロップします。

> **注意（未署名アプリの警告が出る場合）:**
> Apple 開発者署名を行っていないビルドの場合、初回起動時に「開発元が未確認」と表示されることがあります。
> `Control` キーを押しながらアプリを再現クリック ➔ **「開く」** を選択することで実行を許可できます。

---

### 2.3 Windows

`npm run tauri build` を実行すると、`src-tauri/target/release/bundle/msi/` 配下に `.msi` インストーラーが生成されます。

#### インストール手順

1. `src-tauri/target/release/bundle/msi/rsfiler_*_x64_en-US.msi` をダブルクリックします。
2. ウィザードの指示に従ってインストールを完了させます。

---

## 3. アンインストール方法

### Linux (`.deb` の場合)

```bash
sudo apt remove rsfiler

```

### macOS

`/Applications/rsfiler.app` をゴミ箱に移動して削除します。

### Windows

`設定` ➔ `アプリ` ➔ `インストールされているアプリ` から `rsfiler` を選択してアンインストールします。
