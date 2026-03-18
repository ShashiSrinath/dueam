use log::error;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

pub fn get_attachments_dir<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    path.push("attachments");

    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    Ok(path)
}

pub fn save_attachment_data<R: Runtime>(
    app_handle: &AppHandle<R>,
    data: &[u8],
) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let hash = format!("{:x}", hasher.finalize());

    let dir = get_attachments_dir(app_handle)?;
    let file_path = dir.join(&hash);

    if !file_path.exists() {
        fs::write(file_path, data).map_err(|e| e.to_string())?;
    }

    Ok(hash)
}

pub fn get_attachment_path<R: Runtime>(
    app_handle: &AppHandle<R>,
    hash: &str,
) -> Result<PathBuf, String> {
    let dir = get_attachments_dir(app_handle)?;
    let file_path = dir.join(hash);

    if !file_path.exists() {
        return Err("Attachment file not found on disk".to_string());
    }

    Ok(file_path)
}

pub fn read_attachment_data<R: Runtime>(
    app_handle: &AppHandle<R>,
    hash: &str,
) -> Result<Vec<u8>, String> {
    let path = get_attachment_path(app_handle, hash)?;
    fs::read(path).map_err(|e| e.to_string())
}
