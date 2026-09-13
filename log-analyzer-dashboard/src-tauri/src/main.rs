use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{command, State};

const CHUNK_SIZE: usize = 8 * 1024 * 1024;
const MAX_OPEN_FILES: usize = 20;
const HANDLE_TTL_SECS: u64 = 600;

#[derive(Clone, Debug)]
pub struct FileEntry {
    pub file: Arc<Mutex<File>>,
    pub size: u64,
    pub opened_at: Instant,
}

pub struct FileRegistry {
    pub files: HashMap<String, FileEntry>,
}

impl FileRegistry {
    pub fn new() -> Self {
        FileRegistry { files: HashMap::new() }
    }

    pub fn evict_stale(&mut self) {
        let now = Instant::now();
        self.files.retain(|_, entry| {
            now.duration_since(entry.opened_at).as_secs() < HANDLE_TTL_SECS
        });
    }

    pub fn can_open(&self) -> bool {
        self.files.len() < MAX_OPEN_FILES
    }
}

pub fn validate_path(path: &str) -> Result<PathBuf, String> {
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
    let meta = std::fs::metadata(&path).map_err(|e| format!("Metadata error: {}", e))?;
    if meta.file_type().is_symlink() {
        return Err("Symlink detected — symlinks are not allowed".into());
    }
    Ok(path)
}

// Tauri command wrappers
#[command]
fn open_file(path: String, registry: State<Mutex<FileRegistry>>) -> Result<String, String> {
    let validated = validate_path(&path)?;
    let mut reg = registry.lock().unwrap();
    reg.evict_stale();
    if !reg.can_open() {
        return Err(format!("Maximum open files ({}) reached.", MAX_OPEN_FILES));
    }
    let file = File::open(&validated).map_err(|e| format!("Open error: {}", e))?;
    let size = file.metadata().map_err(|e| format!("Metadata error: {}", e))?.len();
    let id = uuid::Uuid::new_v4().to_string();
    reg.files.insert(id.clone(), FileEntry {
        file: Arc::new(Mutex::new(file)),
        size,
        opened_at: Instant::now(),
    });
    Ok(id)
}

#[command]
fn read_chunk(handle_id: String, offset: u64, registry: State<Mutex<FileRegistry>>) -> Result<Vec<u8>, String> {
    let file_arc = {
        let mut reg = registry.lock().unwrap();
        let entry = reg.files.get_mut(&handle_id).ok_or("Invalid or expired file handle")?;
        entry.opened_at = Instant::now();
        entry.file.clone()
    };
    let mut file = file_arc.lock().unwrap();
    file.seek(SeekFrom::Start(offset)).map_err(|e| format!("Seek error: {}", e))?;
    let mut buf = vec![0u8; CHUNK_SIZE];
    let n = file.read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
    buf.truncate(n);
    Ok(buf)
}

#[command]
fn close_file(handle_id: String, registry: State<Mutex<FileRegistry>>) -> Result<(), String> {
    let mut reg = registry.lock().unwrap();
    reg.files.remove(&handle_id).ok_or("Invalid handle")?;
    Ok(())
}

#[command]
fn file_size(handle_id: String, registry: State<Mutex<FileRegistry>>) -> Result<u64, String> {
    let reg = registry.lock().unwrap();
    let entry = reg.files.get(&handle_id).ok_or("Invalid handle")?;
    Ok(entry.size)
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(FileRegistry::new()))
        .invoke_handler(tauri::generate_handler![open_file, read_chunk, close_file, file_size])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("la_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn create_file(dir: &PathBuf, name: &str, content: &[u8]) -> PathBuf {
        let path = dir.join(name);
        let mut f = File::create(&path).unwrap();
        f.write_all(content).unwrap();
        path
    }

    fn create_file_state() -> Mutex<FileRegistry> {
        Mutex::new(FileRegistry::new())
    }

    // Validate path tests
    #[test]
    fn validate_rejects_nonexistent() {
        let dir = setup();
        assert!(validate_path(dir.join("x.log").to_str().unwrap()).is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn validate_rejects_dir() {
        let dir = setup();
        assert!(validate_path(dir.to_str().unwrap()).is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn validate_rejects_exe() {
        let dir = setup();
        let p = create_file(&dir, "test.exe", b"x");
        assert!(validate_path(p.to_str().unwrap()).is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn validate_accepts_log() {
        let dir = setup();
        let p = create_file(&dir, "test.log", b"x");
        assert!(validate_path(p.to_str().unwrap()).is_ok());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn validate_accepts_uppercase() {
        let dir = setup();
        let p = create_file(&dir, "test.LOG", b"x");
        assert!(validate_path(p.to_str().unwrap()).is_ok());
        fs::remove_dir_all(&dir).ok();
    }

    // Registry tests
    #[test]
    fn registry_new_is_empty() {
        let reg = FileRegistry::new();
        assert!(reg.can_open());
        assert!(reg.files.is_empty());
    }

    #[test]
    fn registry_at_capacity() {
        let mut reg = FileRegistry::new();
        for i in 0..MAX_OPEN_FILES {
            let dir = setup();
            let p = create_file(&dir, &format!("f{}.log", i), b"x");
            let f = File::open(&p).unwrap();
            reg.files.insert(format!("h{}", i), FileEntry { file: Arc::new(Mutex::new(f)), size: 1, opened_at: Instant::now() });
        }
        assert!(!reg.can_open());
    }

    #[test]
    fn registry_evicts_stale() {
        let mut reg = FileRegistry::new();
        let dir = setup();
        let p = create_file(&dir, "stale.log", b"x");
        let f = File::open(&p).unwrap();
        reg.files.insert("s".into(), FileEntry { file: Arc::new(Mutex::new(f)), size: 1, opened_at: Instant::now() - std::time::Duration::from_secs(700) });
        reg.evict_stale();
        assert!(reg.files.is_empty());
    }

    #[test]
    fn registry_keeps_fresh() {
        let mut reg = FileRegistry::new();
        let dir = setup();
        let p = create_file(&dir, "fresh.log", b"x");
        let f = File::open(&p).unwrap();
        reg.files.insert("f".into(), FileEntry { file: Arc::new(Mutex::new(f)), size: 1, opened_at: Instant::now() });
        reg.evict_stale();
        assert_eq!(reg.files.len(), 1);
    }

    // Command-level tests using Mutex<State>
    #[test]
    fn open_and_read_file() {
        let dir = setup();
        let p = create_file(&dir, "test.log", b"Hello, world!");
        let state = create_file_state();

        // open_file
        let validated = validate_path(p.to_str().unwrap()).unwrap();
        let mut reg = state.lock().unwrap();
        reg.evict_stale();
        assert!(reg.can_open());
        let file = File::open(&validated).unwrap();
        let size = file.metadata().unwrap().len();
        let id = uuid::Uuid::new_v4().to_string();
        reg.files.insert(id.clone(), FileEntry { file: Arc::new(Mutex::new(file)), size, opened_at: Instant::now() });
        drop(reg);

        // read_chunk
        let file_arc = {
            let mut reg = state.lock().unwrap();
            let entry = reg.files.get_mut(&id).unwrap();
            entry.opened_at = Instant::now();
            entry.file.clone()
        };
        let mut file = file_arc.lock().unwrap();
        file.seek(SeekFrom::Start(0)).unwrap();
        let mut buf = vec![0u8; CHUNK_SIZE];
        let n = file.read(&mut buf).unwrap();
        buf.truncate(n);
        assert_eq!(buf, b"Hello, world!");

        // file_size
        let reg = state.lock().unwrap();
        assert_eq!(reg.files.get(&id).unwrap().size, 13);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_at_offset() {
        let dir = setup();
        let p = create_file(&dir, "test.log", b"0123456789");
        let state = create_file_state();

        let file = File::open(&p).unwrap();
        let id = "test_id".to_string();
        state.lock().unwrap().files.insert(id.clone(), FileEntry { file: Arc::new(Mutex::new(file)), size: 10, opened_at: Instant::now() });

        let file_arc = {
            let mut reg = state.lock().unwrap();
            reg.files.get_mut(&id).unwrap().file.clone()
        };
        let mut file = file_arc.lock().unwrap();
        file.seek(SeekFrom::Start(3)).unwrap();
        let mut buf = vec![0u8; CHUNK_SIZE];
        let n = file.read(&mut buf).unwrap();
        buf.truncate(n);
        assert_eq!(buf, b"3456789");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_beyond_eof() {
        let dir = setup();
        let p = create_file(&dir, "test.log", b"hi");
        let state = create_file_state();

        let file = File::open(&p).unwrap();
        let id = "test_id".to_string();
        state.lock().unwrap().files.insert(id.clone(), FileEntry { file: Arc::new(Mutex::new(file)), size: 2, opened_at: Instant::now() });

        let file_arc = {
            let mut reg = state.lock().unwrap();
            reg.files.get_mut(&id).unwrap().file.clone()
        };
        let mut file = file_arc.lock().unwrap();
        file.seek(SeekFrom::Start(100)).unwrap();
        let mut buf = vec![0u8; CHUNK_SIZE];
        let n = file.read(&mut buf).unwrap();
        assert_eq!(n, 0);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn close_file_frees_entry() {
        let dir = setup();
        let p = create_file(&dir, "test.log", b"x");
        let state = create_file_state();

        let file = File::open(&p).unwrap();
        let id = "test_id".to_string();
        state.lock().unwrap().files.insert(id.clone(), FileEntry { file: Arc::new(Mutex::new(file)), size: 1, opened_at: Instant::now() });

        assert!(state.lock().unwrap().files.contains_key(&id));
        state.lock().unwrap().files.remove(&id);
        assert!(!state.lock().unwrap().files.contains_key(&id));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn zero_byte_file() {
        let dir = setup();
        let p = create_file(&dir, "empty.log", b"");
        let state = create_file_state();

        let file = File::open(&p).unwrap();
        let id = "test_id".to_string();
        state.lock().unwrap().files.insert(id.clone(), FileEntry { file: Arc::new(Mutex::new(file)), size: 0, opened_at: Instant::now() });

        let reg = state.lock().unwrap();
        assert_eq!(reg.files.get(&id).unwrap().size, 0);

        fs::remove_dir_all(&dir).ok();
    }
}
