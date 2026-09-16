//! アプリケーションのエントリポイントモジュール.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// アプリケーションのエントリポイント.
///
/// `rsfiler` ライブラリの実行関数を呼び出し, アプリケーションを起動します.
#[cfg(not(tarpaulin_include))]
fn main() {
    rsfiler::run();
}
