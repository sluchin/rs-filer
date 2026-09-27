import { Channel, invoke } from "@tauri-apps/api/core";
import type { DiskSpace, FileEntry } from "../features/explorer/types";
import type {
  TransferProgress,
  TransferRequest,
  TransferSummary,
} from "../features/operations/types";
import type { Preview } from "../features/preview/types";
import type { AppConfig } from "../features/settings/types";

/**
 * 指定ディレクトリ内のファイル・ディレクトリ一覧を取得します.
 *
 * @param path - 読み込み対象のディレクトリ絶対パス.
 * @returns エントリの配列.
 */
export function readDirectory(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("read_directory", { path });
}

/**
 * ユーザーのホームディレクトリの絶対パスを取得します.
 *
 * @returns ホームディレクトリのパス.
 */
export function getHomeDir(): Promise<string> {
  return invoke<string>("get_home_dir");
}

/**
 * 指定ディレクトリの直下に新しいディレクトリを作成します.
 *
 * @param parent - 作成先の親ディレクトリのパス.
 * @param name - 作成するディレクトリ名.
 */
export function createDirectory(parent: string, name: string): Promise<void> {
  return invoke<void>("create_directory", { parent, name });
}

/**
 * 指定ディレクトリの直下に新しい空ファイルを作成します.
 *
 * @param parent - 作成先の親ディレクトリのパス.
 * @param name - 作成するファイル名.
 */
export function createFile(parent: string, name: string): Promise<void> {
  return invoke<void>("create_file", { parent, name });
}

/**
 * ファイルまたはディレクトリの名前を変更します.
 *
 * @param path - 対象のパス.
 * @param newName - 新しい名前.
 */
export function renameItem(path: string, newName: string): Promise<void> {
  return invoke<void>("rename_item", { path, newName });
}

/**
 * 関連付けられた外部アプリケーションでパスを開きます.
 *
 * @param path - 開く対象のパス.
 */
export function openItem(path: string): Promise<void> {
  return invoke<void>("open_item", { path });
}

/**
 * 環境変数 `VISUAL` / `EDITOR` のエディタでパスを開きます.
 *
 * @param path - 開く対象のパス.
 */
export function openInEditor(path: string): Promise<void> {
  return invoke<void>("open_in_editor", { path });
}

/**
 * 利用可能なドライブのルートパスの一覧を取得します.
 *
 * @returns ルートパスの配列.
 */
export function listDrives(): Promise<string[]> {
  return invoke<string[]>("list_drives");
}

/**
 * 指定パスが載っているディスクの空き容量と全体の容量を取得します.
 *
 * @param path - 調べるパス.
 * @returns 空き容量と全体の容量.
 */
export function getDiskSpace(path: string): Promise<DiskSpace> {
  return invoke<DiskSpace>("get_disk_space", { path });
}

/**
 * コピー・移動先に, 同名のエントリが既にあるかを調べます.
 *
 * @param sources - 対象のパス.
 * @param destDir - 配置先のディレクトリ.
 * @returns 同名のエントリが既にある対象の名前.
 */
export function checkConflicts(
  sources: string[],
  destDir: string,
): Promise<string[]> {
  return invoke<string[]>("check_conflicts", { sources, destDir });
}

/**
 * コピー・移動・削除を実行します. 完了するまで待ち, 進捗は都度通知します.
 *
 * @param request - 依頼.
 * @param onProgress - 進捗の通知先.
 * @returns 結果. 中断された場合は `cancelled` が true.
 */
export function runTransfer(
  request: TransferRequest,
  onProgress: (progress: TransferProgress) => void,
): Promise<TransferSummary> {
  const channel = new Channel<TransferProgress>();
  channel.onmessage = onProgress;
  return invoke<TransferSummary>("run_transfer", {
    request,
    onProgress: channel,
  });
}

/**
 * 実行中のコピー・移動・削除を中断します.
 */
export function cancelTransfer(): Promise<void> {
  return invoke<void>("cancel_transfer");
}

/**
 * ファイルのプレビューを取得します.
 *
 * @param path - 対象のファイルのパス.
 * @returns プレビュー.
 */
export function readPreview(path: string): Promise<Preview> {
  return invoke<Preview>("read_preview", { path });
}

/**
 * 入力途中のパスを補完する候補を取得します.
 *
 * @param input - 入力途中のパス.
 * @returns 候補のパス (ディレクトリのみ. 末尾に `/`).
 */
export function completePath(input: string): Promise<string[]> {
  return invoke<string[]>("complete_path", { input });
}

/**
 * ユーザーのキーマップ設定を読み込みます.
 *
 * @returns キーの並びからコマンド名への対応. 値が null のキーは割り当てを解除する.
 */
export function loadKeymap(): Promise<Record<string, string | null>> {
  return invoke<Record<string, string | null>>("load_keymap");
}

/**
 * アプリケーションを終了します.
 */
export function quitApp(): Promise<void> {
  return invoke<void>("quit_app");
}

/**
 * カレントディレクトリでターミナルを開きます.
 *
 * @param path - ターミナルの作業ディレクトリにするパス.
 */
export function openTerminal(path: string): Promise<void> {
  return invoke<void>("open_terminal", { path });
}

/**
 * 選択したファイルまたはディレクトリに対して, 外部コマンドを実行します.
 *
 * @param command - 実行するコマンド (`%f` を対象のパスに置き換える).
 * @param paths - 対象のパス.
 */
export function runExternalCommand(
  command: string,
  paths: string[],
): Promise<void> {
  return invoke<void>("run_external_command", { command, paths });
}

/**
 * アプリケーションの設定を読み込みます.
 *
 * @returns 設定. 設定ファイルが無い場合は既定値.
 */
export function loadConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("load_config");
}

/**
 * アプリケーションの設定を書き込みます.
 *
 * @param config - 書き込む設定.
 */
export function saveConfig(config: AppConfig): Promise<void> {
  return invoke<void>("save_config", { config });
}
