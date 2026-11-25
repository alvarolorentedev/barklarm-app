use keyring::Entry;

const SERVICE: &str = "dev.barklarm.app.intelligence";
const PROVIDER_KEY: &str = "provider-api-key";

fn provider_user(fingerprint: &str) -> String {
    if fingerprint.is_empty() {
        PROVIDER_KEY.to_string()
    } else {
        format!("{PROVIDER_KEY}:{fingerprint}")
    }
}

fn entry(user: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, user).map_err(|_| "credential_store_unavailable".to_string())
}

pub fn get_provider_key(fingerprint: &str) -> Result<Option<String>, String> {
    match entry(&provider_user(fingerprint))?.get_password() {
        Ok(value) if !value.is_empty() => Ok(Some(value)),
        Ok(_) => Ok(None),
        Err(_) => Ok(None),
    }
}

pub fn set_provider_key(value: &str, fingerprint: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("credential_empty".to_string());
    }
    entry(&provider_user(fingerprint))?
        .set_password(value)
        .map_err(|_| "credential_store_unavailable".to_string())
}

pub fn delete_provider_key(fingerprint: &str) -> Result<(), String> {
    let _ = entry(&provider_user(fingerprint))?.delete_credential();
    Ok(())
}

pub fn has_provider_key(fingerprint: &str) -> bool {
    matches!(get_provider_key(fingerprint), Ok(Some(_)))
}

fn consent_user(fingerprint: &str) -> String {
    format!("consent:{}", fingerprint)
}

pub fn is_destination_approved(fingerprint: &str) -> bool {
    let Ok(entry) = entry(&consent_user(fingerprint)) else {
        return false;
    };
    matches!(entry.get_password(), Ok(value) if value == "approved")
}

pub fn approve_destination(fingerprint: &str) -> Result<(), String> {
    if fingerprint.is_empty() || fingerprint.len() > 200 {
        return Err("fingerprint_invalid".to_string());
    }
    entry(&consent_user(fingerprint))?
        .set_password("approved")
        .map_err(|_| "credential_store_unavailable".to_string())
}
