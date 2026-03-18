// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let start_minimized = std::env::args().any(|arg| arg == "--start-minimized");
    dueam_lib::run(start_minimized)
}
