//! Temporary montage candidates. All masks, transforms and pixels use PhotoCraft.
use super::*;
use photocraft_doc::{
    Document, Layer, LayerContent, LayerId, SmartFilter, SmartObject, SmartSource,
};
use photocraft_geom::Affine;
use std::sync::Arc;
const TAG: [u8; 4] = *b"PIMT";
const WORK_PIXELS: u64 = 16_000_000;
pub(crate) struct Montage {
    source: Document,
    target: Option<LayerId>,
    revision: u32,
}
fn num(p: &Value, k: &str, lo: f64, hi: f64) -> Result<f64> {
    p[k].as_f64()
        .filter(|v| v.is_finite() && *v >= lo && *v <= hi)
        .ok_or_else(|| format!("INVALID_INPUT: {k}"))
}
fn values(v: &Value, n: usize, lo: f64, hi: f64) -> Result<Vec<f64>> {
    let a = v
        .as_array()
        .filter(|a| a.len() == n)
        .ok_or("INVALID_INPUT")?;
    a.iter()
        .map(|v| {
            v.as_f64()
                .filter(|x| x.is_finite() && *x >= lo && *x <= hi)
                .ok_or("INVALID_INPUT".into())
        })
        .collect()
}
pub(crate) fn settings(l: &Layer) -> Option<Value> {
    l.psd_blocks
        .iter()
        .find(|(k, _)| *k == TAG)
        .and_then(|(_, b)| serde_json::from_slice(b).ok())
}
impl Engine {
    pub fn begin_montage(&mut self, bytes: &[u8]) -> Result<Value> {
        bytes_ok(bytes)?;
        let fmt = image::guess_format(bytes).map_err(failed)?;
        if !matches!(fmt, image::ImageFormat::Png | image::ImageFormat::Jpeg) {
            return Err("UNSUPPORTED_FORMAT".into());
        }
        let (w, h) = image::ImageReader::with_format(Cursor::new(bytes), fmt)
            .into_dimensions()
            .map_err(failed)?;
        self.montage_budget(w, h, None, 0)?;
        let mut source = Engine::default();
        source.open_image(bytes)?;
        let doc = source.session.active().unwrap().doc.as_ref().clone();
        let base = &self.session.active().ok_or("INVALID_INPUT")?.doc;
        let p = json!({"crop":[w as f64*0.25,h as f64*0.1,w as f64*0.5,h as f64*0.6],"points":[],"strokes":[],"feather":(w.min(h) as f64*0.008).min(30.0),"x":base.size.width as f64/2.0,"y":base.size.height as f64*0.3,"scale":(base.size.width as f64*0.35/(w as f64*0.5)).clamp(0.01,2.0),"angle":0,"flip":false,"opacity":1,"ev":0,"temperature":0});
        self.montage = Some(Montage {
            source: doc,
            target: None,
            revision: self.revision,
        });
        Ok(json!({"width":w,"height":h,"params":p}))
    }
    // Budget all retained layers/sources, plus decoded source and masked working surface.
    // Canvas-sized pixel estimates are intentionally conservative for sparse photos.
    fn montage_budget(
        &self,
        w: u32,
        h: u32,
        replacing: Option<LayerId>,
        placed: u64,
    ) -> Result<()> {
        dimensions(w, h)?;
        let st = self.session.active().ok_or("INVALID_INPUT")?;
        let mut pixels = 2 * w as u64 * h as u64 + placed;
        for (_, _, layer) in st.doc.walk() {
            if Some(layer.id) == replacing {
                continue;
            }
            if let Some(surface) = layer.surface() {
                let b = surface.content_bounds();
                pixels = pixels.saturating_add(b.width().max(0) as u64 * b.height().max(0) as u64);
            }
            if let LayerContent::Smart(sm) = &layer.content {
                if let SmartSource::Embedded { file_name, bytes } = &sm.source {
                    if file_name == "montage.pcraft" {
                        let m = photocraft_format::read_manifest(bytes).map_err(failed)?;
                        pixels = pixels.saturating_add(
                            m.document.size.width as u64 * m.document.size.height as u64,
                        );
                    } else {
                        return Err("LIMIT_EXCEEDED: unknown embedded source budget".into());
                    }
                } else {
                    return Err("LIMIT_EXCEEDED: linked source budget".into());
                }
            }
        }
        if pixels > WORK_PIXELS || st.memory_bytes() > 192 * 1024 * 1024 {
            return Err("LIMIT_EXCEEDED".into());
        }
        Ok(())
    }
    pub fn edit_montage(&mut self) -> Result<Value> {
        let st = self.session.active().ok_or("INVALID_INPUT")?;
        let id = st.active_layer.ok_or("INVALID_INPUT")?;
        let l = st.doc.layer(id).ok_or("INVALID_INPUT")?;
        let p = settings(l).ok_or("INVALID_INPUT")?;
        let LayerContent::Smart(sm) = &l.content else {
            return Err("INVALID_INPUT".into());
        };
        let SmartSource::Embedded { file_name, bytes } = &sm.source else {
            return Err("INVALID_INPUT".into());
        };
        let m = photocraft_format::read_manifest(bytes).map_err(failed)?;
        self.montage_budget(m.document.size.width, m.document.size.height, Some(id), 0)?;
        if file_name != "montage.pcraft" {
            return Err("INVALID_INPUT".into());
        }
        let mut doc = photocraft_format::load_from_bytes_with(
            bytes,
            &photocraft_format::LoadOptions {
                max_canvas_side: 16384,
                max_total_bytes: 128 * 1024 * 1024,
                max_blob_bytes: 96 * 1024 * 1024,
                ..Default::default()
            },
        )
        .map_err(failed)?;
        if doc.layers.len() != 1 || !matches!(doc.layers[0].content, LayerContent::Raster(_)) {
            return Err("INVALID_INPUT".into());
        }
        doc.layers[0].mask = None;
        doc.selection = None;
        let result = json!({"width":doc.size.width,"height":doc.size.height,"params":p});
        self.montage = Some(Montage {
            source: doc,
            target: Some(id),
            revision: self.revision,
        });
        Ok(result)
    }
    pub fn cancel_montage(&mut self) {
        self.montage = None;
    }
    pub fn montage_source(&self) -> Result<(u32, u32, Vec<u8>)> {
        let m = self.montage.as_ref().ok_or("INVALID_INPUT")?;
        let im = photocraft_compose::thumbnail(&m.source, 900);
        Ok((im.width, im.height, im.pixels))
    }
    fn montage_layer(&self, p: &Value) -> Result<Layer> {
        let m = self
            .montage
            .as_ref()
            .filter(|m| m.revision == self.revision)
            .ok_or("STALE_RESULT")?;
        let (w, h) = (m.source.size.width as f64, m.source.size.height as f64);
        let crop = values(&p["crop"], 4, 0.0, w.max(h))?;
        if crop[2] < 1.0
            || crop[3] < 1.0
            || crop[0] + crop[2] > w + 0.01
            || crop[1] + crop[3] > h + 0.01
        {
            return Err("INVALID_INPUT: crop".into());
        }
        let scale = num(p, "scale", 0.01, 8.0)?;
        let angle = num(p, "angle", -180.0, 180.0)?.to_radians();
        let base = &self.session.active().ok_or("INVALID_INPUT")?.doc;
        let x = num(
            p,
            "x",
            -(base.size.width as f64),
            base.size.width as f64 * 2.0,
        )?;
        let y = num(
            p,
            "y",
            -(base.size.height as f64),
            base.size.height as f64 * 2.0,
        )?;
        let (sn, cs) = angle.sin_cos();
        let bw = (w * cs.abs() + h * sn.abs()) * scale;
        let bh = (w * sn.abs() + h * cs.abs()) * scale;
        if bw > 16384.0 || bh > 16384.0 || bw * bh > WORK_PIXELS as f64 {
            return Err("LIMIT_EXCEEDED".into());
        }
        self.montage_budget(w as u32, h as u32, m.target, (bw.ceil() * bh.ceil()) as u64)?;
        let opacity = num(p, "opacity", 0.0, 1.0)?;
        let ev = num(p, "ev", -2.0, 2.0)?;
        let temp = num(p, "temperature", -50.0, 50.0)?;
        let feather = num(p, "feather", 0.0, 100.0)?;
        let flip = p["flip"].as_bool().ok_or("INVALID_INPUT")?;
        let mut source = Session::new();
        source.add_document(m.source.clone(), None);
        // Temporary histories need no snapshots: only the destination commit is undoable.
        source.active_mut().unwrap().history.max_states = 1;
        let pts = p["points"]
            .as_array()
            .filter(|a| a.is_empty() || (3..=128).contains(&a.len()))
            .ok_or("INVALID_INPUT")?;
        if pts.is_empty() {
            source.execute("select.rect",json!({"x":crop[0],"y":crop[1],"width":crop[2],"height":crop[3],"ellipse":true,"antiAlias":true,"feather":feather})).map_err(failed)?;
        } else {
            for pt in pts {
                let q = values(pt, 2, 0.0, w.max(h))?;
                if q[0] > w || q[1] > h {
                    return Err("INVALID_INPUT".into());
                }
            }
            source
                .execute(
                    "select.lasso",
                    json!({"points":pts,"antiAlias":true,"feather":feather}),
                )
                .map_err(failed)?;
        }
        let strokes = p["strokes"]
            .as_array()
            .filter(|a| a.len() <= 256)
            .ok_or("INVALID_INPUT")?;
        for s in strokes {
            let sx = num(s, "x", 0.0, w)?;
            let sy = num(s, "y", 0.0, h)?;
            let r = num(s, "radius", 1.0, w.min(h).max(1.0) / 2.0)?;
            let restore = s["restore"].as_bool().ok_or("INVALID_INPUT")?;
            source.execute("select.rect",json!({"x":sx-r,"y":sy-r,"width":r*2.0,"height":r*2.0,"ellipse":true,"antiAlias":true,"feather":feather.min(r/2.0),"mode":if restore{"add"}else{"subtract"}})).map_err(failed)?;
        }
        source
            .execute("layer.layerMask.revealSelection", json!({}))
            .map_err(failed)?;
        let bytes =
            photocraft_format::save_to_bytes(&source.active().unwrap().doc, &Default::default())
                .map_err(failed)?;
        let sx = if flip { -scale } else { scale };
        let (a, b, c, d) = (cs * sx, sn * sx, -sn * scale, cs * scale);
        let (cx, cy) = (crop[0] + crop[2] / 2.0, crop[1] + crop[3] / 2.0);
        let transform = Affine {
            m: [a, b, c, d, x - a * cx - c * cy, y - b * cx - d * cy],
        };
        let mut smart = SmartObject::new(
            SmartSource::Embedded {
                file_name: "montage.pcraft".into(),
                bytes: Arc::new(bytes),
            },
            transform,
            None,
        );
        for (command, params) in [
            (
                "image.adjustments.exposure",
                json!({"exposure":ev,"offset":0,"gamma":1}),
            ),
            (
                "image.adjustments.colorBalance",
                json!({"midtones":[temp,0,-temp],"preserveLuminosity":true}),
            ),
        ] {
            smart.smart_filters.push(SmartFilter {
                command: command.into(),
                params,
                blend: Layer::new("", LayerContent::Smart(smart.clone())).blend,
                opacity: 1.0,
                visible: true,
            });
        }
        let mut layer = Layer::new("Cabeza · montaje", LayerContent::Smart(smart));
        layer.opacity = opacity as f32;
        if let Some(id) = m.target {
            let old = base.layer(id).ok_or("STALE_RESULT")?;
            layer.id = id;
            layer.name = old.name.clone();
            layer.visible = old.visible;
        }
        layer
            .psd_blocks
            .push((TAG, Arc::new(serde_json::to_vec(p).map_err(failed)?)));
        // Use the same native compositor, warp and smart-filter functions directly.
        // Upstream desktop caches otherwise retain 32 decoded source variants (up to 1GiB)
        // across mask previews. The web bridge owns only this candidate's working surfaces.
        let source_doc = &source.active().unwrap().doc;
        let surface = photocraft_compose::flatten_to_surface(source_doc, base.pixel_format(), None);
        let placed =
            photocraft_algo::warp::place_source(&surface, source_doc.bounds(), &transform, None)
                .map_err(failed)?;
        if let LayerContent::Smart(sm) = &mut layer.content {
            sm.cache = Some(photocraft_engine::smart_cmds::apply_smart_filters(
                &placed,
                sm,
                base.bounds(),
            ));
        }
        Ok(layer)
    }
    fn candidate(&self, layer: Layer) -> Result<Document> {
        let m = self.montage.as_ref().ok_or("INVALID_INPUT")?;
        let mut doc = self
            .session
            .active()
            .ok_or("INVALID_INPUT")?
            .doc
            .as_ref()
            .clone();
        if let Some(id) = m.target {
            *doc.layer_mut(id).ok_or("STALE_RESULT")? = layer;
        } else {
            doc.layers.push(layer);
        }
        Ok(doc)
    }
    pub fn preview_montage(&self, p: Value) -> Result<(u32, u32, Vec<u8>)> {
        let doc = self.candidate(self.montage_layer(&p)?)?;
        let im = photocraft_compose::thumbnail(&doc, 1200);
        Ok((im.width, im.height, im.pixels))
    }
    pub fn commit_montage(&mut self, p: Value) -> Result<Value> {
        let layer = self.montage_layer(&p)?;
        let id = layer.id;
        let doc = self.candidate(layer)?;
        self.session
            .edit("Montaje de fotografía", |d, active| {
                *d = doc;
                *active = Some(id);
                Ok(())
            })
            .map_err(failed)?;
        self.montage = None;
        self.revision += 1;
        self.inspect()
    }
}
