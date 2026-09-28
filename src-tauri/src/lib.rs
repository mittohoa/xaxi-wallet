// Vo desktop cho XAXI. Toan bo logic nam o phan web;
// tien trinh Rust chi mo cua so, khong dong toi du lieu nguoi dung.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("khong khoi dong duoc cua so XAXI");
}
