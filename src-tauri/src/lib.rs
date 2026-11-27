mod browser;
mod intelligence;
mod store;

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
#[cfg(target_os = "windows")]
use tauri::utils::WindowEffect;
use tauri::utils::config::WindowEffectsConfig;
#[cfg(target_os = "macos")]
use tauri::utils::{WindowEffect, WindowEffectState};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

static MENU_IMAGES_OK: AtomicBool = AtomicBool::new(false);
static TRAY_MODE: AtomicBool = AtomicBool::new(false);
static FOCUS_EPOCH: AtomicU64 = AtomicU64::new(0);
static TRAY_ANCHOR: Mutex<Option<TrayAnchor>> = Mutex::new(None);
static TRAY_HEIGHT: Mutex<f64> = Mutex::new(TRAY_PANEL_MAX_HEIGHT);

const TRAY_PANEL_WIDTH: f64 = 380.0;
const TRAY_PANEL_MIN_HEIGHT: f64 = 200.0;
const TRAY_PANEL_MAX_HEIGHT: f64 = 520.0;
const TRAY_PANEL_GAP: i32 = 6;
const TRAY_PANEL_MARGIN: i32 = 8;

#[derive(Clone, Copy, Debug)]
struct TrayAnchor {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
    scale: f64,
}

fn tray_panel_position(anchor: TrayAnchor, panel_width: i32, panel_height: i32) -> (i32, i32) {
    let icon_center = anchor.x + anchor.width as i32 / 2;
    let below = anchor.y + anchor.height as i32 / 2 < anchor.work_y + anchor.work_height as i32 / 2;
    let min_x = anchor.work_x + TRAY_PANEL_MARGIN;
    let max_x = anchor.work_x + anchor.work_width as i32 - panel_width - TRAY_PANEL_MARGIN;
    let x = (icon_center - panel_width / 2).clamp(min_x, max_x.max(min_x));

    let min_y = anchor.work_y + TRAY_PANEL_MARGIN;
    let max_y = anchor.work_y + anchor.work_height as i32 - panel_height - TRAY_PANEL_MARGIN;
    let preferred_y = if below {
        anchor.y + anchor.height as i32 + TRAY_PANEL_GAP
    } else {
        anchor.y - panel_height - TRAY_PANEL_GAP
    };
    (x, preferred_y.clamp(min_y, max_y.max(min_y)))
}

fn clamp_tray_height(height: f64) -> f64 {
    height.clamp(TRAY_PANEL_MIN_HEIGHT, TRAY_PANEL_MAX_HEIGHT)
}

fn apply_tray_position(
    window: &tauri::WebviewWindow,
    anchor: TrayAnchor,
    height: f64,
) -> tauri::Result<()> {
    let panel_height = (height * anchor.scale).round() as i32;
    let panel_width = (TRAY_PANEL_WIDTH * anchor.scale).round() as i32;
    let (x, y) = tray_panel_position(anchor, panel_width, panel_height);
    window.set_size(PhysicalSize::new(panel_width as u32, panel_height as u32))?;
    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

fn apply_tray_window_effects(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        let effects = WindowEffectsConfig {
            effects: vec![WindowEffect::Popover],
            state: Some(WindowEffectState::Active),
            ..Default::default()
        };
        let _ = window.set_effects(Some(effects));
    }
    #[cfg(target_os = "windows")]
    {
        let effects = WindowEffectsConfig {
            effects: vec![WindowEffect::Acrylic],
            ..Default::default()
        };
        let _ = window.set_effects(Some(effects));
    }
}

fn restore_main_window(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    TRAY_MODE.store(false, Ordering::Relaxed);
    let _ = window.set_effects(None::<WindowEffectsConfig>);
    let _ = window.unminimize();
    window.set_decorations(true)?;
    window.set_always_on_top(false)?;
    window.set_resizable(true)?;
    window.set_skip_taskbar(false)?;
    let scale = window
        .primary_monitor()?
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0);
    window.set_size(PhysicalSize::new(
        (860.0 * scale) as u32,
        (600.0 * scale) as u32,
    ))?;
    window.center()?;
    window.show()?;
    window.set_focus()?;
    let _ = window.emit("barklarm-window-mode", "main");
    Ok(())
}

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
        restore_main_window(&window).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    show_window(app)
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_window_mode(app: tauri::AppHandle) -> Result<String, String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok("hidden".into());
    };
    let visible = window.is_visible().map_err(|error| error.to_string())?;
    if !visible {
        Ok("hidden".into())
    } else if TRAY_MODE.load(Ordering::Relaxed) {
        Ok("tray".into())
    } else {
        Ok("main".into())
    }
}

#[tauri::command]
fn show_tray_panel(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())?;
    let monitor = app
        .monitor_from_point(
            x as f64 + width as f64 / 2.0,
            y as f64 + height as f64 / 2.0,
        )
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "tray monitor is unavailable".to_string())?;
    let work = monitor.work_area();
    let anchor = TrayAnchor {
        x,
        y,
        width,
        height,
        work_x: work.position.x,
        work_y: work.position.y,
        work_width: work.size.width,
        work_height: work.size.height,
        scale: monitor.scale_factor(),
    };
    *TRAY_ANCHOR.lock().map_err(|error| error.to_string())? = Some(anchor);
    TRAY_MODE.store(true, Ordering::Relaxed);

    window
        .set_decorations(false)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window
        .set_resizable(false)
        .map_err(|error| error.to_string())?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())?;
    let height = *TRAY_HEIGHT.lock().map_err(|error| error.to_string())?;
    apply_tray_position(&window, anchor, clamp_tray_height(height))
        .map_err(|error| error.to_string())?;
    apply_tray_window_effects(&window);
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    let _ = window.emit("barklarm-window-mode", "tray");
    Ok(())
}

#[tauri::command]
fn resize_tray_panel(app: tauri::AppHandle, height: f64) -> Result<(), String> {
    if !TRAY_MODE.load(Ordering::Relaxed) {
        return Ok(());
    }
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let anchor = *TRAY_ANCHOR.lock().map_err(|error| error.to_string())?;
    if let Some(anchor) = anchor {
        let height = clamp_tray_height(height);
        *TRAY_HEIGHT.lock().map_err(|error| error.to_string())? = height;
        apply_tray_position(&window, anchor, height).map_err(|error| error.to_string())?;
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            store::load_config,
            store::save_config,
            store::import_config,
            store::export_config,
            store::quit_app,
            browser::list_browsers,
            browser::open_with_browser,
            log_frontend,
            show_window,
            open_main_window,
            hide_window,
            get_window_mode,
            show_tray_panel,
            resize_tray_panel,
            menu_images_supported,
            intelligence::intelligence_status,
            intelligence::start_model_download,
            intelligence::cancel_model_download,
            intelligence::remove_model,
            intelligence::ensure_managed_runtime,
            intelligence::stop_managed_runtime,
            intelligence::begin_managed_inference,
            intelligence::end_managed_inference,
            intelligence::get_provider_key,
            intelligence::set_provider_key,
            intelligence::delete_provider_key,
            intelligence::has_provider_key,
            intelligence::is_destination_approved,
            intelligence::approve_destination,
            intelligence::revoke_destination,
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
                let window_for_close = window.clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window_for_close.hide();
                    }
                    WindowEvent::Focused(true) => {
                        FOCUS_EPOCH.fetch_add(1, Ordering::Relaxed);
                    }
                    WindowEvent::Focused(false) if TRAY_MODE.load(Ordering::Relaxed) => {
                        // Menu-bar clicks can move focus before the JS tray handler runs.
                        // Defer the hide so the handler can toggle the panel instead of
                        // observing a hidden window and reopening it.
                        let epoch = FOCUS_EPOCH.fetch_add(1, Ordering::Relaxed) + 1;
                        let window = window_for_close.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(250));
                            if FOCUS_EPOCH.load(Ordering::Relaxed) == epoch
                                && TRAY_MODE.load(Ordering::Relaxed)
                            {
                                let _ = window.hide();
                            }
                        });
                    }
                    _ => {}
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

#[cfg(test)]
mod tray_tests {
    use super::{TrayAnchor, tray_panel_position};

    fn anchor(y: i32, height: u32, work_y: i32, work_height: u32) -> TrayAnchor {
        TrayAnchor {
            x: 600,
            y,
            width: 24,
            height,
            work_x: 0,
            work_y,
            work_width: 1440,
            work_height,
            scale: 2.0,
        }
    }

    #[test]
    fn places_below_a_top_menu_bar() {
        let (x, y) = tray_panel_position(anchor(0, 24, 0, 875), 760, 400);
        assert_eq!(x, 232);
        assert_eq!(y, 30);
    }

    #[test]
    fn places_above_a_bottom_taskbar() {
        let (x, y) = tray_panel_position(anchor(850, 24, 0, 875), 760, 400);
        assert_eq!(x, 232);
        assert_eq!(y, 444);
    }

    #[test]
    fn clamps_to_the_visible_work_area() {
        let mut edge = anchor(0, 24, 0, 875);
        edge.x = 1430;
        let (x, y) = tray_panel_position(edge, 760, 400);
        assert_eq!(x, 672);
        assert_eq!(y, 30);
    }

    #[test]
    fn clamps_a_tall_panel_inside_the_work_area() {
        let (_, y) = tray_panel_position(anchor(850, 24, 0, 875), 760, 900);
        assert_eq!(y, 8);
    }
}
