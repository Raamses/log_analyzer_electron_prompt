use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{command, State};
use serde::{Deserialize, Serialize};

const CHUNK_SIZE: usize = 8 * 1024 * 1024; // 8MB

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileHandle {
    id: String,
}

struct FileRegistry {
    files: HashMap<String, (PathBuf, u64)>,
}

impl FileRegistry {
    fn new() -> Self {
        FileRegistry { files: HashMap::new() }
    }
}

type RegistryState<'a> = State<'a, Mutex<FileRegistry>>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChunkResult {
    data: Vec<u8>,
    offset: u64,
    total: u64,
    done: bool,
}

fn validate_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("Path does not exist".into());
    }
    if !path.is_file() {
        return Err("Path is not a file".into());
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let allowed = ["log", "csv", "tsv", "json", "txt", "gz", "bz2"];
    if !allowed.contains(&ext.as_str()) {
        return Err(format!("Extension '{}' not allowed. Allowed: {:?}", ext, allowed));
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
    let metadata = validated.metadata().map_err(|e| format!("Metadata error: {}", e))?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut reg = registry.lock().unwrap();
    reg.files.insert(id.clone(), (validated, metadata.len()));
    Ok(FileHandle { id })
}

#[command]
fn read_chunk(handle: FileHandle, offset: u64, registry: RegistryState) -> Result<ChunkResult, String> {
    let mut reg = registry.lock().unwrap();
    let (path, total) = reg.files.get(&handle.id).cloned().ok_or("Invalid or expired file handle".to_string())?;
    let mut file = File::open(&path).map_err(|e| format!("Open error: {}", e))?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| format!("Seek error: {}", e))?;
    let mut buf = vec![0u8; CHUNK_SIZE];
    let n = std::io::BufReader::with_capacity(CHUNK_SIZE, file).read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
    buf.truncate(n);
    Ok(ChunkResult { data: buf, offset, total, done: offset + n as u64 >= total })
}

#[command]
fn close_file(handle: FileHandle, registry: RegistryState) -> Result<(), String> {
    let mut reg = registry.lock().unwrap();
    reg.files.remove(&handle.id).ok_or("Invalid handle".to_string())?;
    Ok(())
}

#[command]
fn file_info(handle: FileHandle, registry: RegistryState) -> Result<serde_json::Value, String> {
    let reg = registry.lock().unwrap();
    let (path, size) = reg.files.get(&handle.id).cloned().ok_or("Invalid handle".to_string())?;
    Ok(serde_json::json!({ "path": path.display().to_string(), "size": size }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(FileRegistry::new()))
        .invoke_handler(tauri::generate_handler![open_file, read_chunk, close_file, file_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
