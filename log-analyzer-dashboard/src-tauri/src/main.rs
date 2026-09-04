use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{State, command};

const CHUNK_SIZE: usize = 8 * 1024 * 1024; // 8MB

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileHandle {
    id: String,
}

struct FileRegistry {
    files: HashMap<String, (PathBuf, Arc<Mutex<File>>)>,
}

impl FileRegistry {
    fn new() -> Self {
        FileRegistry {
            files: HashMap::new(),
        }
    }
}

type RegistryState<'a> = State<'a, Mutex<FileRegistry>>;

fn validate_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("Path does not exist".into());
    }
    if !path.is_file() {
        return Err("Path is not a file".into());
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed = ["log", "csv", "tsv", "json", "txt", "gz", "bz2"];
    if !allowed.contains(&ext.as_str()) {
        return Err(format!(
            "Extension '{}' not allowed. Allowed: {:?}",
            ext, allowed
        ));
    }
    let meta = std::fs::symlink_metadata(&path).map_err(|e| format!("Metadata error: {}", e))?;
    if meta.file_type().is_symlink() {
        return Err("Symlink detected — symlinks are not allowed".into());
    }
    Ok(path)
}

#[command]
fn open_file(path: String, registry: RegistryState) -> Result<FileHandle, String> {
    let validated = validate_path(&path)?;
    // FIX #1: Open file once, store Arc<Mutex<File>> to eliminate TOCTOU
    let file = File::open(&validated).map_err(|e| format!("Open error: {}", e))?;
    let _metadata = file
        .metadata()
        .map_err(|e| format!("Metadata error: {}", e))?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut reg = registry.lock().unwrap();
    reg.files
        .insert(id.clone(), (validated, Arc::new(Mutex::new(file))));
    Ok(FileHandle { id })
}

#[command]
fn read_chunk(handle: FileHandle, offset: u64, registry: RegistryState) -> Result<Vec<u8>, String> {
    // FIX #2: Tight mutex scope — only for HashMap lookup, release before I/O
    let file_arc = {
        let reg = registry.lock().unwrap();
        let (_, file_arc) = reg
            .files
            .get(&handle.id)
            .cloned()
            .ok_or("Invalid or expired file handle".to_string())?;
        file_arc.clone()
    }; // Mutex released here!

    // Lock only the specific file, not the whole registry
    let mut file = file_arc.lock().unwrap();
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Seek error: {}", e))?;
    let mut buf = vec![0u8; CHUNK_SIZE];
    let _n = file
        .read(&mut buf)
        .map_err(|e| format!("Read error: {}", e))?;
    buf.truncate(_n);

    // FIX #3: Return Vec<u8> directly for fast binary IPC (no JSON serialization)
    Ok(buf)
}

#[command]
fn close_file(handle: FileHandle, registry: RegistryState) -> Result<(), String> {
    let mut reg = registry.lock().unwrap();
    reg.files
        .remove(&handle.id)
        .ok_or("Invalid handle".to_string())?;
    Ok(())
}

// FIX #4: Renamed from file_info, returns only size (no path leak to renderer)
#[command]
fn file_size(handle: FileHandle, registry: RegistryState) -> Result<u64, String> {
    let reg = registry.lock().unwrap();
    let (_, file_arc) = reg
        .files
        .get(&handle.id)
        .cloned()
        .ok_or("Invalid handle".to_string())?;
    let file = file_arc.lock().unwrap();
    let meta = file.metadata().map_err(|e| e.to_string())?;
    Ok(meta.len())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(FileRegistry::new()))
        .invoke_handler(tauri::generate_handler![
            open_file, read_chunk, close_file, file_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
