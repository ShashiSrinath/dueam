use keyring::Entry;
use rand::RngCore;
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng},
    ChaCha20Poly1305, Nonce
};
use std::fs;
use std::path::PathBuf;

pub struct EncryptedStore {
    key: [u8; 32],
}

impl EncryptedStore {
    pub async fn new() -> Result<Self, String> {
        let key_hex = tokio::task::spawn_blocking(|| {
            let entry = Entry::new("dream-email", "master-key").map_err(|e| e.to_string())?;
            
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
        }).await.map_err(|e| e.to_string())??;

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
}
