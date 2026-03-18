use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use keyring::Entry;
use rand::RngCore;
use std::fs;
use std::path::PathBuf;

pub struct EncryptedStore {
    key: [u8; 32],
}

impl EncryptedStore {
    pub async fn new() -> Result<Self, String> {
        let key_hex = tokio::task::spawn_blocking(|| {
            let entry = Entry::new("dueam", "master-key").map_err(|e| e.to_string())?;

            match entry.get_password() {
                Ok(k) => Ok(k),
                Err(keyring::Error::NoEntry) => {
                    let mut new_key = [0u8; 32];
                    rand::thread_rng().fill_bytes(&mut new_key);
                    let hex = hex::encode(new_key);
                    entry.set_password(&hex).map_err(|e| e.to_string())?;
                    Ok(hex)
                }
                Err(e) => Err(e.to_string()),
            }
        })
        .await
        .map_err(|e| e.to_string())??;

        let key_bytes = hex::decode(key_hex).map_err(|e| e.to_string())?;
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);

        Ok(Self { key })
    }

    pub fn save(&self, path: PathBuf, data: &[u8]) -> Result<(), String> {
        let cipher = ChaCha20Poly1305::new(&self.key.into());
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, data).map_err(|e| e.to_string())?;

        // Combined file: [Nonce (12 bytes)][Ciphertext]
        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(path, combined).map_err(|e| e.to_string())
    }

    pub fn load(&self, path: PathBuf) -> Result<Vec<u8>, String> {
        if !path.exists() {
            return Err("File not found".to_string());
        }

        let combined = fs::read(path).map_err(|e| e.to_string())?;
        if combined.len() < 12 {
            return Err("Invalid data format".to_string());
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        let cipher = ChaCha20Poly1305::new(&self.key.into());

        cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())
    }

    #[cfg(test)]
    pub fn new_test(key: [u8; 32]) -> Self {
        Self { key }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_encryption_decryption_cycle() {
        let key = [1u8; 32];
        let store = EncryptedStore::new_test(key);
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.enc");
        let original_data = b"hello world secret data";

        store
            .save(file_path.clone(), original_data)
            .expect("Save failed");
        let decrypted_data = store.load(file_path).expect("Load failed");

        assert_eq!(original_data, decrypted_data.as_slice());
    }

    #[test]
    fn test_load_non_existent_file() {
        let key = [1u8; 32];
        let store = EncryptedStore::new_test(key);
        let file_path = PathBuf::from("non_existent_file.enc");

        let result = store.load(file_path);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "File not found");
    }

    #[test]
    fn test_load_invalid_data_format() {
        let key = [1u8; 32];
        let store = EncryptedStore::new_test(key);
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("invalid.enc");

        fs::write(&file_path, b"short").unwrap();

        let result = store.load(file_path);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Invalid data format");
    }

    #[test]
    fn test_decryption_with_wrong_key() {
        let key1 = [1u8; 32];
        let key2 = [2u8; 32];
        let store1 = EncryptedStore::new_test(key1);
        let store2 = EncryptedStore::new_test(key2);
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.enc");
        let original_data = b"secret data";

        store1
            .save(file_path.clone(), original_data)
            .expect("Save failed");
        let result = store2.load(file_path);

        assert!(result.is_err());
    }
}
