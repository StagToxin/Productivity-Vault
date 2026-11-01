// Windows'ta arka planda konsol penceresi açılmasın
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vault_lib::run()
}
