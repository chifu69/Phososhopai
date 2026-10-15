//! Narrow, in-memory PHOTO IA bridge to the real PhotoCraft engine.
use photocraft_engine::Session;
use serde_json::{Value, json};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

type Result<T> = std::result::Result<T, String>;
const MAX_PIXELS: u64 = 24_000_000;
const MAX_BYTES: usize = 64 * 1024 * 1024;
fn dimensions(w: u32, h: u32) -> Result<()> {
    if w == 0 || h == 0 || w > 16384 || h > 16384 || w as u64 * h as u64 > MAX_PIXELS {
        Err("LIMIT_EXCEEDED".into())
    } else {
        Ok(())
    }
}
fn bytes_ok(b: &[u8]) -> Result<()> {
    if b.is_empty() {
        Err("INVALID_INPUT".into())
    } else if b.len() > MAX_BYTES {
        Err("LIMIT_EXCEEDED".into())
    } else {
        Ok(())
    }
}
fn failed(e: impl std::fmt::Display) -> String {
    format!("INVALID_INPUT: {e}")
}
#[derive(Default)]
pub struct Engine {
    session: Session,
    revision: u32,
}
impl Engine {
    fn install(&mut self, doc: photocraft_doc::Document) -> Result<()> {
        dimensions(doc.size.width, doc.size.height)?;
        let mut candidate = Session::new();
        candidate.add_document(doc, None);
        if let Some(d) = candidate.active_mut() {
            d.history.max_states = 15;
            d.history.max_bytes = 128 * 1024 * 1024;
        }
        self.session = candidate;
        self.revision = 1;
        Ok(())
    }
    pub fn open_image(&mut self, bytes: &[u8]) -> Result<()> {
        bytes_ok(bytes)?;
        let format = image::guess_format(bytes).map_err(failed)?;
        if !matches!(format, image::ImageFormat::Png | image::ImageFormat::Jpeg) {
            return Err("UNSUPPORTED_FORMAT".into());
        }
        let reader = image::ImageReader::with_format(Cursor::new(bytes), format);
        let (w, h) = reader.into_dimensions().map_err(failed)?;
        dimensions(w, h)?;
        let result = photocraft_io::import(
            if format == image::ImageFormat::Png {
                "photo.png"
            } else {
                "photo.jpg"
            },
            bytes,
        )
        .map_err(failed)?;
        self.install(result.document)
    }
    pub fn open_project(&mut self, bytes: &[u8]) -> Result<()> {
        bytes_ok(bytes)?;
        let m = photocraft_format::read_manifest(bytes).map_err(failed)?;
        dimensions(m.document.size.width, m.document.size.height)?;
        let opts = photocraft_format::LoadOptions {
            max_canvas_side: 16384,
            max_total_bytes: 256 * 1024 * 1024,
            max_blob_bytes: 96 * 1024 * 1024,
            ..Default::default()
        };
        self.install(photocraft_format::load_from_bytes_with(bytes, &opts).map_err(failed)?)
    }
    pub fn inspect(&self) -> Result<Value> {
        let st = self.session.active().ok_or("INVALID_INPUT: no document")?;
        let d = &st.doc;
        let layers:Vec<_>=d.walk().iter().map(|(_,_,l)|json!({"id":l.id.0.to_string(),"name":l.name,"visible":l.visible,"opacity":l.opacity})).collect();
        Ok(
            json!({"id":d.id.0.to_string(),"revision":self.revision,"width":d.size.width,"height":d.size.height,"layers":layers,"canUndo":st.history.can_undo(),"canRedo":st.history.can_redo(),"pixelBytes":st.memory_bytes(),"activeLayer":st.active_layer.map(|id|id.0.to_string()),"canAdjust":st.active_layer.and_then(|id|d.layer(id)).and_then(|l|l.surface()).is_some_and(|p|!p.content_bounds().is_empty())}),
        )
    }
    pub fn execute(&mut self, action: &str, p: Value) -> Result<Value> {
        let (cmd, params) = match action {
            "exposure" => {
                let ev = p["ev"]
                    .as_f64()
                    .filter(|x| x.is_finite() && (-2.0..=2.0).contains(x))
                    .ok_or("INVALID_INPUT")?;
                (
                    "image.adjustments.exposure",
                    json!({"exposure":ev,"offset":0,"gamma":1}),
                )
            }
            "selectLayer" => {
                let id = p["layer"]
                    .as_str()
                    .and_then(|x| x.parse::<u64>().ok())
                    .ok_or("INVALID_INPUT")?;
                ("layer.select", json!({"layer":id}))
            }
            "addLayer" => {
                let name = p["name"].as_str().unwrap_or("Capa nueva");
                if name.len() > 160 {
                    return Err("INVALID_INPUT".into());
                }
                ("layer.new.layer", json!({"name":name}))
            }
            "setLayerVisibility" => {
                let id = p["layer"]
                    .as_str()
                    .and_then(|s| s.parse::<u64>().ok())
                    .ok_or("INVALID_INPUT")?;
                let visible = p["visible"].as_bool().ok_or("INVALID_INPUT")?;
                ("layer.setProps", json!({"layer":id,"visible":visible}))
            }
            "undo" => ("edit.undo", json!({})),
            "redo" => ("edit.redo", json!({})),
            _ => return Err("INVALID_INPUT: action".into()),
        };
        self.session.execute(cmd, params).map_err(failed)?;
        self.revision += 1;
        self.inspect()
    }
    pub fn preview(&self, ev: Option<f64>, max_side: u32) -> Result<(u32, u32, Vec<u8>)> {
        if max_side == 0 || max_side > 1200 {
            return Err("INVALID_INPUT".into());
        }
        let doc = self.session.active().ok_or("INVALID_INPUT")?.doc.as_ref();
        let image = if let Some(v) = ev {
            let mut temp = Engine::default();
            temp.install(doc.clone())?;
            if let Some(layer) = self.session.active().and_then(|d| d.active_layer) {
                temp.session
                    .execute("layer.select", json!({"layer":layer.0}))
                    .map_err(failed)?;
            }
            temp.execute("exposure", json!({"ev":v}))?;
            photocraft_compose::thumbnail(
                &temp.session.active().ok_or("INVALID_INPUT")?.doc,
                max_side,
            )
        } else {
            photocraft_compose::thumbnail(doc, max_side)
        };
        Ok((image.width, image.height, image.pixels))
    }
    pub fn serialize(&self) -> Result<Vec<u8>> {
        let doc = &self.session.active().ok_or("INVALID_INPUT")?.doc;
        photocraft_format::save_to_bytes(doc, &Default::default()).map_err(failed)
    }
    pub fn export_png(&self) -> Result<Vec<u8>> {
        let doc = &self.session.active().ok_or("INVALID_INPUT")?.doc;
        dimensions(doc.size.width, doc.size.height)?;
        photocraft_io::export(doc, "png", &Default::default())
            .map(|r| r.bytes)
            .map_err(failed)
    }
}
#[wasm_bindgen]
pub struct Bridge {
    engine: Engine,
}
#[wasm_bindgen]
impl Bridge {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            engine: Engine::default(),
        }
    }
    pub fn open_image(&mut self, b: &[u8]) -> std::result::Result<String, JsValue> {
        self.engine
            .open_image(b)
            .and_then(|_| self.engine.inspect())
            .map(|x| x.to_string())
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn open_project(&mut self, b: &[u8]) -> std::result::Result<String, JsValue> {
        self.engine
            .open_project(b)
            .and_then(|_| self.engine.inspect())
            .map(|x| x.to_string())
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn inspect(&self) -> std::result::Result<String, JsValue> {
        self.engine
            .inspect()
            .map(|x| x.to_string())
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn execute(&mut self, action: &str, payload: &str) -> std::result::Result<String, JsValue> {
        let p = serde_json::from_str(payload).map_err(|_| JsValue::from_str("INVALID_INPUT"))?;
        self.engine
            .execute(action, p)
            .map(|x| x.to_string())
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn preview(&self, ev: Option<f64>) -> std::result::Result<Vec<u8>, JsValue> {
        self.engine
            .preview(ev, 1200)
            .map(|(w, h, data)| {
                let mut bytes = Vec::with_capacity(data.len() + 8);
                bytes.extend(w.to_le_bytes());
                bytes.extend(h.to_le_bytes());
                bytes.extend(data);
                bytes
            })
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn serialize(&self) -> std::result::Result<Vec<u8>, JsValue> {
        self.engine.serialize().map_err(|e| JsValue::from_str(&e))
    }
    pub fn export_png(&self) -> std::result::Result<Vec<u8>, JsValue> {
        self.engine.export_png().map_err(|e| JsValue::from_str(&e))
    }
}
