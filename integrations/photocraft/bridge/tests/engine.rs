use photoia_photocraft_bridge::Engine;
use serde_json::json;
fn fixture() -> Vec<u8> {
    let im = image::RgbaImage::from_fn(32, 24, |x, _| {
        image::Rgba([64, 80, 96, if x == 0 { 0 } else { 255 }])
    });
    let mut out = std::io::Cursor::new(Vec::new());
    im.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}
#[test]
fn open_preserves_pixels_and_undo() {
    let mut e = Engine::default();
    e.open_image(&fixture()).unwrap();
    let before = e.export_png().unwrap();
    let info = e.inspect().unwrap();
    assert_eq!(info["width"], 32);
    e.execute("exposure", json!({"ev":1.0})).unwrap();
    let changed = e.export_png().unwrap();
    assert_ne!(before, changed);
    e.execute("undo", json!({})).unwrap();
    assert_eq!(before, e.export_png().unwrap());
    e.execute("redo", json!({})).unwrap();
    assert_eq!(changed, e.export_png().unwrap());
    let im = image::load_from_memory(&changed).unwrap().to_rgba8();
    assert_eq!(im.get_pixel(0, 0)[3], 0);
    assert!(im.get_pixel(10, 10)[0] > 64);
}
#[test]
fn project_roundtrip_and_invalid_input() {
    let mut e = Engine::default();
    e.open_image(&fixture()).unwrap();
    e.execute("addLayer", json!({"name":"Prueba"})).unwrap();
    let bytes = e.serialize().unwrap();
    let before = e.inspect().unwrap();
    assert!(e.open_image(b"invalid").is_err());
    assert_eq!(before, e.inspect().unwrap());
    let mut restored = Engine::default();
    restored.open_project(&bytes).unwrap();
    assert_eq!(
        restored.inspect().unwrap()["layers"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(e.export_png().unwrap(), restored.export_png().unwrap());
    assert!(e.execute("shell", json!({})).is_err());
    assert!(e.execute("exposure", json!({"ev":100})).is_err());
}
#[test]
fn preview_does_not_commit() {
    let mut e = Engine::default();
    e.open_image(&fixture()).unwrap();
    let before = e.inspect().unwrap();
    let png = e.export_png().unwrap();
    let preview = e.preview(Some(1.0), 1200).unwrap();
    assert_eq!((preview.0, preview.1), (32, 24));
    assert_eq!(before, e.inspect().unwrap());
    assert_eq!(png, e.export_png().unwrap());
}

#[test]
fn adjustment_targets_selected_photo_after_empty_layer() {
    let mut e = Engine::default();
    e.open_image(&fixture()).unwrap();
    let photo = e.inspect().unwrap()["layers"][0]["id"].clone();
    let original = e.preview(None, 1200).unwrap().2;
    e.execute("addLayer", json!({"name":"Vacía"})).unwrap();
    assert_eq!(e.inspect().unwrap()["canAdjust"], false);
    e.execute("selectLayer", json!({"layer":photo})).unwrap();
    assert_eq!(e.inspect().unwrap()["canAdjust"], true);
    let preview = e.preview(Some(1.0), 1200).unwrap().2;
    assert_ne!(preview, original);
    e.execute("exposure", json!({"ev":1.0})).unwrap();
    assert_eq!(preview, e.preview(None, 1200).unwrap().2);
}
