export const ACTIONS=new Set(['openImage','openProject','inspect','exposure','addLayer','setLayerVisibility','selectLayer','undo','redo','renderPreview','serialize','exportImage','close']);
export function failure(code,message=code){return Object.assign(new Error(message),{code})}
export function validRequest(m){return m?.protocol===1&&Number.isSafeInteger(m.id)&&Number.isSafeInteger(m.epoch)&&ACTIONS.has(m.action)}
