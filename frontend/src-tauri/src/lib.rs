use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresencePayload {
    client_id: String,
    details: String,
    state: Option<String>,
    large_image: Option<String>,
    large_text: Option<String>,
    reset_timer: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresenceDebugState {
    connected: bool,
    client_id: String,
    details: String,
    state: String,
    large_image: String,
    large_text: String,
    last_error: String,
    last_event: String,
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
mod discord_presence {
    use super::{DiscordPresenceDebugState, DiscordPresencePayload};
    use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Default)]
    pub struct DiscordPresenceState {
        inner: Mutex<Option<ManagedDiscordClient>>,
        debug: Mutex<DiscordPresenceDebugState>,
    }

    struct ManagedDiscordClient {
        client_id: String,
        started_at: i64,
        client: DiscordIpcClient,
    }

    impl Drop for ManagedDiscordClient {
        fn drop(&mut self) {
            let _ = self.client.clear_activity();
            let _ = self.client.close();
        }
    }

    fn now_unix_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or(0)
    }

    fn connect_client(client_id: &str) -> Result<ManagedDiscordClient, String> {
        let mut client = DiscordIpcClient::new(client_id).map_err(|err| err.to_string())?;
        client.connect().map_err(|err| err.to_string())?;

        Ok(ManagedDiscordClient {
            client_id: client_id.to_string(),
            started_at: now_unix_timestamp(),
            client,
        })
    }

    fn update_debug(
        state: &DiscordPresenceState,
        update: impl FnOnce(&mut DiscordPresenceDebugState),
    ) {
        if let Ok(mut debug) = state.debug.lock() {
            update(&mut debug);
        }
    }

    impl Drop for DiscordPresenceState {
        fn drop(&mut self) {
            if let Ok(mut guard) = self.inner.lock() {
                let _ = guard.take();
            }
        }
    }

    pub fn update_presence(
        state: &DiscordPresenceState,
        payload: DiscordPresencePayload,
    ) -> Result<(), String> {
        let client_id = payload.client_id.trim();
        if client_id.is_empty() {
            update_debug(state, |debug| {
                debug.connected = false;
                debug.client_id.clear();
                debug.last_event = String::from("client_id_missing");
                debug.last_error.clear();
            });
            return clear_presence(state);
        }

        update_debug(state, |debug| {
            debug.client_id = client_id.to_string();
            debug.details = payload.details.clone();
            debug.state = payload.state.clone().unwrap_or_default();
            debug.large_image = payload.large_image.clone().unwrap_or_default();
            debug.large_text = payload.large_text.clone().unwrap_or_default();
            debug.last_event = String::from("update_requested");
            debug.last_error.clear();
        });

        let mut guard = state
            .inner
            .lock()
            .map_err(|_| String::from("failed to lock Discord presence state"))?;

        let needs_new_client = guard
            .as_ref()
            .map(|client| client.client_id != client_id)
            .unwrap_or(true);

        if needs_new_client {
            if let Some(existing) = guard.as_mut() {
                let _ = existing.client.clear_activity();
                let _ = existing.client.close();
            }
            match connect_client(client_id) {
                Ok(client) => {
                    *guard = Some(client);
                    update_debug(state, |debug| {
                        debug.connected = true;
                        debug.last_event = String::from("connected");
                    });
                }
                Err(error) => {
                    update_debug(state, |debug| {
                        debug.connected = false;
                        debug.last_event = String::from("connect_failed");
                        debug.last_error = error.clone();
                    });
                    return Err(error);
                }
            }
        }

        let managed = guard
            .as_mut()
            .ok_or_else(|| String::from("Discord client was not initialized"))?;

        if payload.reset_timer.unwrap_or(false) {
            managed.started_at = now_unix_timestamp();
        }

        let mut activity = activity::Activity::new()
            .details(&payload.details)
            .timestamps(activity::Timestamps::new().start(managed.started_at));

        if let Some(state_text) = payload.state.as_deref().filter(|value| !value.trim().is_empty()) {
            activity = activity.state(state_text);
        }

        if payload.large_image.is_some() || payload.large_text.is_some() {
            let mut assets = activity::Assets::new();

            if let Some(image) = payload.large_image.as_deref().filter(|value| !value.trim().is_empty()) {
                assets = assets.large_image(image);
            }

            if let Some(text) = payload.large_text.as_deref().filter(|value| !value.trim().is_empty()) {
                assets = assets.large_text(text);
            }

            activity = activity.assets(assets);
        }

        // Some Discord-compatible clients can get "stuck" on an older activity
        // if we only overwrite in-place, so clear first and reconnect once on failure.
        let _ = managed.client.clear_activity();

        match managed.client.set_activity(activity.clone()) {
            Ok(_) => {
                update_debug(state, |debug| {
                    debug.connected = true;
                    debug.last_event = String::from("set_activity_ok");
                    debug.last_error.clear();
                });
                Ok(())
            }
            Err(_first_err) => {
                update_debug(state, |debug| {
                    debug.last_event = String::from("set_activity_retry");
                });

                let replacement = match connect_client(client_id) {
                    Ok(client) => client,
                    Err(error) => {
                        update_debug(state, |debug| {
                            debug.connected = false;
                            debug.last_event = String::from("reconnect_failed");
                            debug.last_error = error.clone();
                        });
                        return Err(error);
                    }
                };
                *managed = replacement;

                managed
                    .client
                    .clear_activity()
                    .ok();

                match managed
                    .client
                    .set_activity(activity)
                {
                    Ok(_) => {
                        update_debug(state, |debug| {
                            debug.connected = true;
                            debug.last_event = String::from("set_activity_retry_ok");
                            debug.last_error.clear();
                        });
                        Ok(())
                    }
                    Err(err) => {
                        let error = err.to_string();
                        update_debug(state, |debug| {
                            debug.connected = false;
                            debug.last_event = String::from("set_activity_failed");
                            debug.last_error = error.clone();
                        });
                        Err(error)
                    }
                }
            }
        }
    }

    pub fn clear_presence(state: &DiscordPresenceState) -> Result<(), String> {
        let mut guard = state
            .inner
            .lock()
            .map_err(|_| String::from("failed to lock Discord presence state"))?;

        if let Some(mut managed) = guard.take() {
            let _ = managed.client.clear_activity();
            let _ = managed.client.close();
        }

        update_debug(state, |debug| {
            debug.connected = false;
            debug.last_event = String::from("cleared");
        });

        Ok(())
    }

    pub fn get_debug_state(state: &DiscordPresenceState) -> Result<DiscordPresenceDebugState, String> {
        state.debug
            .lock()
            .map(|debug| debug.clone())
            .map_err(|_| String::from("failed to lock Discord presence debug state"))
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod discord_presence {
    use super::{DiscordPresenceDebugState, DiscordPresencePayload};

    #[derive(Default)]
    pub struct DiscordPresenceState;

    pub fn update_presence(
        _state: &DiscordPresenceState,
        _payload: DiscordPresencePayload,
    ) -> Result<(), String> {
        Ok(())
    }

    pub fn clear_presence(_state: &DiscordPresenceState) -> Result<(), String> {
        Ok(())
    }

    pub fn get_debug_state(_state: &DiscordPresenceState) -> Result<DiscordPresenceDebugState, String> {
        Ok(DiscordPresenceDebugState::default())
    }
}

#[tauri::command]
fn update_discord_presence(
    state: tauri::State<'_, discord_presence::DiscordPresenceState>,
    payload: DiscordPresencePayload,
) -> Result<(), String> {
    discord_presence::update_presence(&state, payload)
}

#[tauri::command]
fn clear_discord_presence(
    state: tauri::State<'_, discord_presence::DiscordPresenceState>,
) -> Result<(), String> {
    discord_presence::clear_presence(&state)
}

#[tauri::command]
fn get_discord_presence_debug_state(
    state: tauri::State<'_, discord_presence::DiscordPresenceState>,
) -> Result<DiscordPresenceDebugState, String> {
    discord_presence::get_debug_state(&state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(discord_presence::DiscordPresenceState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            update_discord_presence,
            clear_discord_presence,
            get_discord_presence_debug_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
