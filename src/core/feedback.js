// Feedback payload: pure, no DOM. Exactly what leaves the device when the person presses Send.

export const FEEDBACK_KINDS = ['bug', 'chord', 'idea'];
export const MAX_MESSAGE = 2000;

/** At least 3 non-space characters. @param {string} message */
export function messageOk(message) { return String(message).replace(/\s/g, '').length >= 3; }

/**
 * @param {{kind:string, message:string, attach:boolean, project?:any, appName:string}} o
 * @returns {{kind:string, message:string, app:string, version:number, project?:object}}
 */
export function buildFeedbackPayload({ kind, message, attach, project, appName }) {
  const body = {
    kind: FEEDBACK_KINDS.includes(kind) ? kind : 'bug',
    message: String(message).trim().slice(0, MAX_MESSAGE),
    app: appName,
    version: 1,
  };
  if (attach && project && typeof project === 'object') {
    const { id, createdAt, updatedAt, name, ...rest } = project; void id; void createdAt; void updatedAt; void name;
    const copy = JSON.parse(JSON.stringify(rest));
    // the signature written on the video may be a handle: it never leaves the device
    if (copy.text && typeof copy.text === 'object') copy.text.watermark = '';
    return { ...body, project: copy };
  }
  return body;
}
