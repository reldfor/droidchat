import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { Platform } from 'react-native';

import { bytesToHex } from './bytes';

export const MAX_CHAT_IMAGE_BYTES = 30 * 1024 * 1024;
export type ChatImage = {
  uri: string;
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  sha1: string;
  dispose: () => void;
};

/** Use the system photo picker; no broad photo-library permission is needed. */
export async function pickChatImage(): Promise<ChatImage | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const gif = asset.mimeType === 'image/gif' || /\.gif$/i.test(asset.fileName ?? asset.uri);
  let uri = asset.uri;
  let width = asset.width;
  let height = asset.height;
  let mimeType = gif ? 'image/gif' : 'image/jpeg';
  let generated = false;
  let dispose = () => {};
  try {
    // Keep GIF animation. Convert HEIC/large photos to a broadly compatible,
    // bounded image off the JS thread; preserve PNG transparency.
    if (!gif) {
      const format = asset.mimeType === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG;
      const context = ImageManipulator.manipulate(uri, { maxWidth: 2048, maxHeight: 2048 });
      try {
        const rendered = await context.renderAsync();
        try {
          const saved = await rendered.saveAsync({ format, compress: 0.85 });
          uri = saved.uri;
          width = saved.width;
          height = saved.height;
          mimeType = format === SaveFormat.PNG ? 'image/png' : 'image/jpeg';
          generated = true;
        } finally { rendered.release(); }
      } finally { context.release(); }
    }
    if (generated && Platform.OS !== 'web') {
      const temporary = new File(uri);
      dispose = () => { try { if (temporary.exists) temporary.delete(); } catch { /* Cache cleanup is best effort. */ } };
    }
    let buffer: ArrayBuffer;
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      buffer = await response.arrayBuffer();
    } else {
      const file = new File(uri);
      if (file.size > MAX_CHAT_IMAGE_BYTES) throw new Error('Choose an image smaller than 30 MB.');
      buffer = await file.arrayBuffer();
    }
    if (!buffer.byteLength || buffer.byteLength > MAX_CHAT_IMAGE_BYTES) throw new Error('Choose an image smaller than 30 MB.');
    if (!width || !height) throw new Error('This image could not be read. Choose a different photo.');
    const bytes = new Uint8Array(buffer);
    const sha1 = bytesToHex(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA1, bytes)));
    const extension = mimeType === 'image/png' ? 'png' : gif ? 'gif' : 'jpg';
    return { uri, bytes, filename: `image-${sha1}.${extension}`, mimeType, width, height, sha1, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
