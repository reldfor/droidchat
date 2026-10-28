import { isSteamImageUrl } from './chat-media';
import type { ChatImage } from './image-picker';

// The mobile APK sets CHAT_BASE_URL to steam-chat.com, separately from
// COMMUNITY_BASE_URL. The upload controllers live on the chat origin.
const CHAT_UPLOAD = 'https://steam-chat.com/chat/';
const MAX_BYTES = 30 * 1024 * 1024;

export class ImageUploadError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); this.name = 'ImageUploadError'; }
}

type UploadTicket = {
  ugcid: string;
  use_https?: boolean;
  url_host: string;
  url_path: string;
  request_headers?: { name: string; value: string }[];
  hmac?: string;
  timestamp?: number | string;
};
type Credentials = { steamId: string; accessToken: string; sessionId: string };

async function timedFetch(url: string, options: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

/** Chat commit sends the image itself; do not send a second friend message. */
export async function uploadChatImage(
  credentials: Credentials,
  friendSteamId: string,
  image: ChatImage,
  isCurrent: () => boolean = () => true,
): Promise<string | undefined> {
  if (!image.bytes.length || image.bytes.length > MAX_BYTES) throw new ImageUploadError('Choose an image smaller than 30 MB.');
  if (!/^\d{17}$/.test(friendSteamId)) throw new ImageUploadError('This Steam friend could not be found.');
  if (!/^[a-f0-9]{40}$/i.test(image.sha1)) throw new ImageUploadError('This image could not be read. Choose it again.');
  const fields: Record<string, string> = {
    sessionid: credentials.sessionId, l: 'english', file_name: `${credentials.sessionId}_${image.filename}`,
    file_sha: image.sha1, file_type: image.mimeType,
    file_image_width: String(image.width), file_image_height: String(image.height),
  };
  const cookie = `sessionid=${credentials.sessionId}; steamLoginSecure=${encodeURIComponent(`${credentials.steamId}||${credentials.accessToken}`)}`;
  async function post(endpoint: string, values: Record<string, string>): Promise<unknown> {
    const form = new FormData();
    for (const [name, value] of Object.entries(values)) form.append(name, value);
    let response: Response;
    try {
      const query = endpoint === 'beginfileupload' ? '?l=english' : '';
      response = await timedFetch(`${CHAT_UPLOAD}${endpoint}/${query}`, { method: 'POST', headers: { Cookie: cookie }, credentials: 'omit', redirect: 'error', body: form });
    } catch {
      throw new ImageUploadError('Could not reach Steam\'s image upload service. Check your connection and try again.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ImageUploadError(`Steam refused the image upload session (HTTP ${response.status}). Try sending the image again.`);
    }
    if (!response.ok) throw new ImageUploadError(`Steam could not complete the image upload (HTTP ${response.status}).`);
    try { return await response.json(); }
    catch {
      throw new ImageUploadError('Steam returned an invalid image upload response. Reconnect to Steam and try again.');
    }
  }
  if (!isCurrent()) throw new ImageUploadError('Your Steam session changed. Choose the image again.');
  const begin = await post('beginfileupload', { ...fields, file_size: String(image.bytes.length) }) as { result?: UploadTicket; hmac?: string; timestamp?: number | string };
  const ticket = begin?.result;
  const hmac = begin?.hmac ?? ticket?.hmac;
  const timestamp = begin?.timestamp ?? ticket?.timestamp;
  if (!ticket || !/^\d+$/.test(String(ticket.ugcid)) || !hmac || timestamp === undefined || !/^[a-z0-9.-]+(?::\d+)?$/i.test(ticket.url_host ?? '') || !ticket.url_path?.startsWith('/')) {
    throw new ImageUploadError('Steam refused the image upload. Reconnect to Steam and try again.');
  }
  // Login cookies go only to steam-chat.com. The storage host receives its
  // signed headers and the binary image, never our login or session cookies.
  const headers: Record<string, string> = {};
  for (const header of ticket.request_headers ?? []) {
    if (!/^(?:host|content-length|cookie)$/i.test(header.name)) headers[header.name] = header.value;
  }
  const commitFields = { ...fields, ugcid: String(ticket.ugcid), timestamp: String(timestamp), hmac, friend_steamid: friendSteamId, spoiler: '0' };
  try {
    if (!isCurrent()) throw new Error('Session changed');
    const uploaded = await timedFetch(`${ticket.use_https === false ? 'http' : 'https'}://${ticket.url_host}${ticket.url_path}`, { method: 'PUT', headers, credentials: 'omit', redirect: 'error', body: image.bytes }, 90_000);
    if (!uploaded.ok) throw new Error('Storage rejected upload');
    if (!isCurrent()) throw new Error('Session changed');
  } catch {
    try { await post('commitfileupload', { ...commitFields, success: '0' }); } catch { /* Best-effort discard of the provisional file. */ }
    throw new ImageUploadError('The image could not be uploaded. Check your connection and try again.');
  }
  let committed: { success?: number; error?: string; result?: { details?: { url?: string } } };
  try { committed = await post('commitfileupload', { ...commitFields, success: '1' }) as typeof committed; }
  catch { throw new ImageUploadError('Steam did not confirm the image. Check this conversation before sending it again.', true); }
  if (committed?.success !== 1) throw new ImageUploadError('Steam could not send this image. Try again.');
  const url = committed.result?.details?.url;
  return url && isSteamImageUrl(url) ? url : undefined;
}
