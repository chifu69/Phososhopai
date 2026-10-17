use photoia_photocraft_bridge::Engine;
use serde_json::{Value, json};
fn photo(color: [u8; 4]) -> Vec<u8> {
    let im = image::RgbaImage::from_pixel(40, 40, image::Rgba(color));
    let mut b = std::io::Cursor::new(vec![]);
    im.write_to(&mut b, image::ImageFormat::Png).unwrap();
    b.into_inner()
}
fn setup() -> Engine {
    let mut e = Engine::default();
    e.open_image(&photo([0, 0, 200, 255])).unwrap();
    e
}
fn params() -> Value {
    json!({"crop":[10,10,20,20],"points":[],"strokes":[],"feather":0,"x":20,"y":20,"scale":1,"angle":0,"flip":false,"opacity":1,"ev":0,"temperature":0})
}
#[test]
fn montage_atomic_mask_cancel_and_reload() {
    let mut e = setup();
    let original = e.export_png().unwrap();
    let info = e.inspect().unwrap();
    e.begin_montage(&photo([220, 20, 0, 255])).unwrap();
    let p = params();
    let preview = e.preview_montage(p.clone()).unwrap();
    assert_eq!(e.inspect().unwrap(), info);
    assert_eq!(e.export_png().unwrap(), original);
    assert!(preview.2[(20 * 40 + 20) * 4] > 150);
    assert_eq!(&preview.2[0..4], &[0, 0, 200, 255]);
    e.cancel_montage();
    assert_eq!(e.inspect().unwrap(), info);
    assert!(e.commit_montage(p.clone()).is_err());
    e.begin_montage(&photo([220, 20, 0, 255])).unwrap();
    e.commit_montage(p.clone()).unwrap();
    let mounted = e.export_png().unwrap();
    assert_ne!(original, mounted);
    e.execute("undo", json!({})).unwrap();
    assert_eq!(original, e.export_png().unwrap());
    e.execute("redo", json!({})).unwrap();
    assert_eq!(mounted, e.export_png().unwrap());
    let saved = e.serialize().unwrap();
    let mut restored = Engine::default();
    restored.open_project(&saved).unwrap();
    assert_eq!(mounted, restored.export_png().unwrap());
    restored.edit_montage().unwrap();
    restored.commit_montage(p).unwrap();
    assert_eq!(mounted, restored.export_png().unwrap());
}
#[test]
fn polygon_feather_refinement_and_geometry_limits() {
    let mut e = setup();
    e.begin_montage(&photo([220, 20, 0, 255])).unwrap();
    let original = e.inspect().unwrap();
    let mut p = params();
    p["points"] = json!([[10, 10], [30, 10], [10, 30]]);
    p["feather"] = json!(1);
    p["angle"] = json!(30);
    p["flip"] = json!(true);
    let a = e.preview_montage(p.clone()).unwrap();
    p["strokes"] = json!([{ "x":20,"y":20,"radius":4,"restore":false}]);
    let b = e.preview_montage(p.clone()).unwrap();
    assert_ne!(a.2, b.2);
    p["scale"] = json!(1e8);
    assert!(e.commit_montage(p).is_err());
    assert_eq!(original, e.inspect().unwrap());
    assert!(e.begin_montage(b"bad").is_err());
    assert_eq!(original, e.inspect().unwrap());
}

#[test]
fn repeated_transforms_use_source_and_layers_are_undoable() {
    let mut e = setup();
    e.begin_montage(&photo([220, 20, 0, 255])).unwrap();
    let p = params();
    e.commit_montage(p.clone()).unwrap();
    let original = e.export_png().unwrap();
    let head = e.inspect().unwrap()["activeLayer"].clone();
    let base = e.inspect().unwrap()["layers"][0]["id"].clone();
    e.edit_montage().unwrap();
    let mut small = p.clone();
    small["scale"] = json!(0.5);
    e.commit_montage(small).unwrap();
    e.edit_montage().unwrap();
    e.commit_montage(p.clone()).unwrap();
    assert_eq!(original, e.export_png().unwrap());
    e.execute("moveLayer", json!({"target":base,"position":"below"}))
        .unwrap();
    assert_ne!(original, e.export_png().unwrap());
    e.execute("undo", json!({})).unwrap();
    assert_eq!(original, e.export_png().unwrap());
    e.execute("selectLayer", json!({"layer":head})).unwrap();
    e.execute("deleteLayer", json!({})).unwrap();
    assert_eq!(e.inspect().unwrap()["layers"].as_array().unwrap().len(), 1);
    e.execute("undo", json!({})).unwrap();
    assert_eq!(original, e.export_png().unwrap());
}
#[test]
fn recovery_stroke_reveals_original_and_adjustments_preserve_alpha() {
    let mut e = setup();
    e.begin_montage(&photo([100, 80, 60, 255])).unwrap();
    let mut p = params();
    let before = e.preview_montage(p.clone()).unwrap();
    p["strokes"] = json!([{"x":20,"y":20,"radius":5,"restore":false}]);
    let hidden = e.preview_montage(p.clone()).unwrap();
    assert_ne!(before.2, hidden.2);
    p["strokes"]
        .as_array_mut()
        .unwrap()
        .push(json!({"x":20,"y":20,"radius":5,"restore":true}));
    let restored = e.preview_montage(p.clone()).unwrap();
    let i = (20 * 40 + 20) * 4;
    assert_eq!(&restored.2[i..i + 4], &before.2[i..i + 4]);
    p["ev"] = json!(1);
    p["temperature"] = json!(25);
    let lit = e.preview_montage(p.clone()).unwrap();
    assert!(lit.2[i] > before.2[i]);
    assert_eq!(lit.2[i + 3], 255);
    assert_eq!(&lit.2[0..4], &[0, 0, 200, 255]);
    e.commit_montage(p).unwrap();
    let exported = image::load_from_memory(&e.export_png().unwrap())
        .unwrap()
        .to_rgba8();
    assert_eq!(exported.as_raw(), &lit.2);
}

#[test]
fn many_montages_cannot_bypass_aggregate_budget() {
    let mut e = setup();
    let im = image::RgbaImage::from_pixel(1000, 1000, image::Rgba([100, 80, 60, 255]));
    let mut b = std::io::Cursor::new(vec![]);
    im.write_to(&mut b, image::ImageFormat::Png).unwrap();
    let bytes = b.into_inner();
    let mut refused = false;
    for _ in 0..17 {
        let before = e.inspect().unwrap();
        match e.begin_montage(&bytes) {
            Err(message) => {
                assert!(message.contains("LIMIT_EXCEEDED"));
                assert_eq!(before, e.inspect().unwrap());
                refused = true;
                break;
            }
            Ok(mut info) => {
                info["params"]["scale"] = json!(0.05);
                match e.commit_montage(info["params"].clone()) {
                    Ok(_) => {}
                    Err(message) => {
                        assert!(message.contains("LIMIT_EXCEEDED"));
                        assert_eq!(before, e.inspect().unwrap());
                        refused = true;
                        break;
                    }
                }
            }
        }
    }
    assert!(
        refused,
        "accumulated retained sources must count against memory budget"
    );
}
