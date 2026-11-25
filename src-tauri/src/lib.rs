mod intelligence;
mod store;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WindowEvent};

static MENU_IMAGES_OK: AtomicBool = AtomicBool::new(false);

// macOS 27 hides menu item images for apps linked against the macOS 27 SDK.
// Tauri/muda doesn't expose `preferredImageVisibility` yet, so restore it
// whenever a native menu begins tracking.
#[cfg(target_os = "macos")]
fn install_menu_image_visibility_fix() -> bool {
    use block2::RcBlock;
    use objc2::{class, msg_send, sel};
    use objc2_app_kit::{NSMenu, NSMenuDidBeginTrackingNotification};
    use objc2_foundation::{NSNotification, NSNotificationCenter};
    use std::ptr::NonNull;

    let supported: bool = unsafe {
        msg_send![
            class!(NSMenuItem),
            instancesRespondToSelector: sel!(setPreferredImageVisibility:)
        ]
    };
    if !supported {
        // Pre-macOS 27 draws menu item images normally.
        return true;
    }

    unsafe fn make_images_visible(menu: &NSMenu) {
        for item in menu.itemArray().iter() {
            let responds: bool =
                msg_send![&*item, respondsToSelector: sel!(setPreferredImageVisibility:)];
            if responds {
                let _: () = msg_send![&*item, setPreferredImageVisibility: 1isize];
            }
            if let Some(submenu) = item.submenu() {
                unsafe { make_images_visible(&submenu) };
            }
        }
        menu.update();
    }

    let block = RcBlock::new(|notification: NonNull<NSNotification>| unsafe {
        let notification = notification.as_ref();
        if let Some(object) = notification.object()
            && let Some(menu) = object.downcast_ref::<NSMenu>()
        {
            make_images_visible(menu);
        }
    });

    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSMenuDidBeginTrackingNotification),
            None,
            None,
            &block,
        )
    };

    // The notification center owns both the block and the observer for the
    // lifetime of the app; leaking these handles keeps them registered.
    std::mem::forget(observer);
    std::mem::forget(block);
    true
}

#[tauri::command]
fn menu_images_supported() -> bool {
    if std::env::var("BARKLARM_MENU_FALLBACK").as_deref() == Ok("1") {
        return false;
    }
    MENU_IMAGES_OK.load(Ordering::Relaxed)
}

#[tauri::command]
fn log_frontend(message: String) {
    println!("[frontend] {message}");
}

#[tauri::command]
fn show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(intelligence::IntelligenceState::default())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            store::load_config,
            store::save_config,
            store::import_config,
            store::export_config,
            store::quit_app,
            log_frontend,
            show_window,
            menu_images_supported,
            intelligence::intelligence_status,
            intelligence::start_model_download,
            intelligence::cancel_model_download,
            intelligence::remove_model,
            intelligence::ensure_managed_runtime,
            intelligence::stop_managed_runtime,
            intelligence::get_provider_key,
            intelligence::set_provider_key,
            intelligence::delete_provider_key,
            intelligence::has_provider_key,
            intelligence::is_destination_approved,
            intelligence::approve_destination,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory)?;
                let supported = install_menu_image_visibility_fix();
                MENU_IMAGES_OK.store(supported, Ordering::Relaxed);
            }

            if let Some(window) = app.get_webview_window("main") {
                #[cfg(debug_assertions)]
                {
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                let window_for_close = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_for_close.hide();
                    }
                });
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            intelligence::cleanup_stale(app.handle());
            intelligence::spawn_idle_reaper(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            intelligence::shutdown(handle);
        }
    });
}
