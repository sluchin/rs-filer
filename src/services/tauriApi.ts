import { invoke } from "@tauri-apps/api/core";
import type { DiskSpace, FileEntry } from "../features/explorer/types";

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
 * ファイルまたはディレクトリを対象ディレクトリ配下へコピーします.
 *
 * @param srcPath - コピー元のパス.
 * @param destDir - コピー先のディレクトリパス.
 */
export function copyItem(srcPath: string, destDir: string): Promise<void> {
  return invoke<void>("copy_item", { srcPath, destDir });
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
 * ファイルまたはディレクトリを削除します.
 *
 * @param path - 対象のパス.
 * @param permanent - true の場合は完全に削除し, false の場合はゴミ箱へ移動する.
 */
export function deleteItem(path: string, permanent: boolean): Promise<void> {
  return invoke<void>("delete_item", { path, permanent });
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
