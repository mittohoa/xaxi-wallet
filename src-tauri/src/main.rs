// Tat cua so console tren Windows o ban release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    xaxi_lib::run()
}
