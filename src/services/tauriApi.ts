import { Channel } from "@tauri-apps/api/core";
import { commands } from "../bindings";
import type { DiskSpace, FileEntry } from "../features/explorer/types";
import type { DirStats, ItemInfo } from "../features/info/types";
import type {
  NestedConflict,
  TransferProgress,
  TransferRequest,
  TransferSummary,
} from "../features/operations/types";
import type { Preview } from "../features/preview/types";
import type {
  AppConfig,
  LastPaths,
  PaneHistory,
} from "../features/settings/types";
import type { LogLevel } from "../bindings";

export { commands };
export type { LogLevel } from "../bindings";

/**
 * 指定ディレクトリ内のファイル・ディレクトリ一覧を取得します.
 *
 * @param path - 読み込み対象のディレクトリ絶対パス.
 * @returns エントリの配列.
 */
export function readDirectory(path: string): Promise<FileEntry[]> {
  return commands.readDirectory(path);
}

/**
 * 複数のディレクトリについて, 直下に表示対象のエントリ (ファイルまたはディレクトリ) があるかを,
 * まとめて調べます. ツリー表示で, 配下に何も無いディレクトリの展開マークを消すために使います.
 *
 * @param paths - 調べるディレクトリの絶対パスの配列.
 * @param showHidden - 隠しファイルも数えるか.
 * @returns paths と同じ順序の, エントリの有無の配列 (あれば true).
 */
export function dirsHaveEntries(
  paths: string[],
  showHidden: boolean,
): Promise<boolean[]> {
  return commands.dirsHaveEntries(paths, showHidden);
}

/**
 * ファイル・ディレクトリの詳細 (サイズ・日時・権限など) を取得します.
 *
 * @param path - 対象の絶対パス.
 * @returns 詳細.
 */
export function getItemInfo(path: string): Promise<ItemInfo> {
  return commands.getItemInfo(path);
}

/**
 * ディレクトリの配下 (再帰) の, ファイル・ディレクトリの数と合計サイズを数えます. 新しく呼ぶと, 前の計算は
 * 中断されます. 時間 (10 秒) と数の上限があり, 超えると, そこまでの合計を返します.
 *
 * @param path - 対象のディレクトリの絶対パス.
 * @returns 合計.
 */
export function getDirStats(path: string): Promise<DirStats> {
  return commands.dirStats(path);
}

/**
 * ユーザーのホームディレクトリの絶対パスを取得します.
 *
 * @returns ホームディレクトリのパス.
 */
export function getHomeDir(): Promise<string> {
  return commands.getHomeDir();
}

/**
 * 指定ディレクトリの直下に新しいディレクトリを作成します.
 *
 * @param parent - 作成先の親ディレクトリのパス.
 * @param name - 作成するディレクトリ名.
 */
export async function createDirectory(
  parent: string,
  name: string,
): Promise<void> {
  await commands.createDirectory(parent, name);
}

/**
 * 指定ディレクトリの直下に新しい空ファイルを作成します.
 *
 * @param parent - 作成先の親ディレクトリのパス.
 * @param name - 作成するファイル名.
 */
export async function createFile(parent: string, name: string): Promise<void> {
  await commands.createFile(parent, name);
}

/**
 * ファイルまたはディレクトリの名前を変更します.
 *
 * @param path - 対象のパス.
 * @param newName - 新しい名前.
 */
export async function renameItem(path: string, newName: string): Promise<void> {
  await commands.renameItem(path, newName);
}

/**
 * 関連付けられた外部アプリケーションでファイルまたはディレクトリを開きます.
 *
 * @param path - 開く対象のパス.
 */
export async function openItem(path: string): Promise<void> {
  await commands.openItem(path);
}

/**
 * 指定したエディタでファイルを開きます. エディタが未指定の場合は OS の既定のアプリケーションを使います.
 *
 * @param path - 開くファイルのパス.
 */
export async function openInEditor(path: string): Promise<void> {
  await commands.openInEditor(path);
}

/**
 * 利用可能なドライブのルートパスの一覧を取得します (Windows ではドライブレター, それ以外はルートのみ).
 *
 * @returns ルートパスの配列.
 */
export function listDrives(): Promise<string[]> {
  return commands.listDrives();
}

/**
 * 指定したパスが載っているディスクの空き容量と全体の容量を取得します.
 *
 * @param path - 調べるパス (ディスク上の任意のパス).
 * @returns ディスク容量の情報.
 */
export function getDiskSpace(path: string): Promise<DiskSpace> {
  return commands.getDiskSpace(path);
}

/**
 * 配置先に同名のエントリがあるかを調べます (上書きの確認).
 *
 * @param sources - 対象のパス.
 * @param destDir - 配置先のディレクトリ.
 * @param destName - コピー時の新しい名前 (オプション).
 * @returns 同名のエントリがある対象の名前. 無ければ空.
 */
export function checkConflicts(
  sources: string[],
  destDir: string,
  destName?: string,
): Promise<string[]> {
  return commands.checkConflicts(
    sources,
    destDir,
    destName as unknown as string | null,
  );
}

/**
 * 配置先に同名のファイルがあり, 配置先のほうが更新日時が新しい対象を調べます (古いもので上書きすることになるかの確認).
 *
 * @param sources - 対象のパス.
 * @param destDir - 配置先のディレクトリ.
 * @param destName - コピー時の新しい名前 (オプション).
 * @returns 配置先のほうが新しい対象の名前. 無ければ空.
 */
export function checkStaleOverwrites(
  sources: string[],
  destDir: string,
  destName?: string,
): Promise<string[]> {
  return commands.checkStaleOverwrites(
    sources,
    destDir,
    destName as unknown as string | null,
  );
}

/**
 * 同名のディレクトリを統合するとき, 中にある同名のファイルを調べます. 上書きの確認 (1 件ずつ) に使います.
 *
 * @param sources - 対象のパス.
 * @param destDir - 配置先のディレクトリ.
 * @returns 同名のファイルの一覧 (対象ごと, 名前順). 無ければ空.
 */
export function checkNestedConflicts(
  sources: string[],
  destDir: string,
): Promise<NestedConflict[]> {
  return commands.checkNestedConflicts(sources, destDir);
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
  return commands.runTransfer(request, channel);
}

/**
 * 実行中のコピー・移動・削除を中断します.
 */
export function cancelTransfer(): Promise<void> {
  return commands.cancelTransfer();
}

/**
 * ファイルリストをシステムクリップボードにコピーします.
 *
 * @param paths - コピーするファイルパスの配列.
 */
export async function copyFilesToClipboard(paths: string[]): Promise<void> {
  await commands.copyFilesToClipboard(paths);
}

/**
 * 文字列 (フルパスや名前) を, そのままシステムクリップボードにコピーします.
 *
 * @param text - コピーする文字列.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  await commands.copyTextToClipboard(text);
}

/**
 * システムクリップボードからファイルリストを読み取ります.
 *
 * @returns ファイルパスの配列.
 */
export function readClipboardFiles(): Promise<string[]> {
  return commands.readClipboardFiles();
}

/**
 * ファイルのプレビューを取得します.
 *
 * @param path - 対象のファイルのパス.
 * @returns プレビュー.
 */
export function readPreview(path: string): Promise<Preview> {
  // バックエンドは, 種類ごとに必要な項目を必ず入れて返す (`Preview` は, その絞り込み)
  return commands.readPreview(path) as Promise<Preview>;
}

/**
 * 入力途中のパスを補完する候補を取得します.
 *
 * @param input - 入力途中のパス.
 * @returns 候補のパス (ディレクトリのみ. 末尾に `/`).
 */
export function completePath(input: string): Promise<string[]> {
  return commands.completePath(input);
}

/**
 * ユーザーのキーマップ設定を読み込みます.
 *
 * @returns キーの並びからコマンド名への対応. 値が null のキーは割り当てを解除する.
 */
export function loadKeymap(): Promise<Record<string, string | null>> {
  return commands.loadKeymap();
}

/**
 * アプリケーションを終了します.
 */
export function quitApp(): Promise<void> {
  return commands.quitApp();
}

/**
 * カレントディレクトリでターミナルを開きます.
 *
 * @param path - ターミナルの作業ディレクトリにするパス.
 */
export async function openTerminal(path: string): Promise<void> {
  await commands.openTerminal(path);
}

/**
 * 選択したファイルまたはディレクトリに対して, 外部コマンドを実行します.
 *
 * @param command - 実行するコマンド (`%f` を対象のパスに置き換える).
 * @param paths - 対象のパス.
 */
export async function runExternalCommand(
  command: string,
  paths: string[],
): Promise<void> {
  await commands.runExternalCommand(command, paths);
}

/**
 * アプリケーションの設定を読み込みます.
 *
 * @returns 設定. 設定ファイルが無い場合は既定値.
 */
export function loadConfig(): Promise<AppConfig> {
  return commands.loadConfig();
}

/**
 * アプリケーションの設定を書き込みます.
 *
 * @param config - 書き込む設定.
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  await commands.saveConfig(config);
}

/**
 * 左右のペインのディレクトリを, 設定ファイルへ書き込みます. 他の設定は変えません.
 *
 * @param paths - 書き込む左右のペインのディレクトリ.
 */
export async function saveLastPaths(paths: LastPaths): Promise<void> {
  await commands.saveLastPaths(paths);
}

/**
 * 左右のペインのディレクトリの移動履歴を読み込みます. 今は無いディレクトリは除かれ, 設定の件数の上限
 * (`history_limit`) までになっています.
 *
 * @returns 左右のペインの履歴 (古い順). 保存されていない場合は空.
 */
export function loadHistory(): Promise<PaneHistory> {
  return commands.loadHistory();
}

/**
 * 左右のペインのディレクトリの移動履歴を, 履歴のファイルへ書き込みます.
 *
 * @param history - 書き込む左右のペインの履歴 (古い順).
 */
export async function saveHistory(history: PaneHistory): Promise<void> {
  await commands.saveHistory(history);
}

/**
 * フロントエンドのログメッセージを, バックエンドのログ (標準エラー出力とログファイル) へ転送します.
 *
 * @param level - ログの重大度.
 * @param message - ログの内容.
 */
export function logFrontendMessage(
  level: LogLevel,
  message: string,
): Promise<void> {
  return commands.logFrontendMessage(level, message);
}
