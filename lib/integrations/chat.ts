import { Unzip, UnzipInflate, strFromU8 } from "fflate";
export type ChatMessage = {
  date: string;
  time: string;
  speaker: string;
  text: string;
};
export function parseWhatsApp(text: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.replace(/[\u200e\u200f]/g, "");
    const match = line.match(
      /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*(?:-\s*)?([^:]+):\s?(.*)$/i,
    );
    if (match) {
      const [, day, month, shortYear, time, speaker, message] = match;
      const year = shortYear.length === 2 ? `20${shortYear}` : shortYear;
      const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      const d = new Date(`${date}T00:00:00Z`);
      if (
        !Number.isFinite(d.getTime()) ||
        d.toISOString().slice(0, 10) !== date
      )
        throw new Error(`Invalid export date: ${day}/${month}/${year}`);
      messages.push({ date, time, speaker: speaker.trim(), text: message });
    } else if (messages.length && line.trim())
      messages[messages.length - 1].text += `\n${raw}`;
  }
  if (!messages.length)
    throw new Error(
      "No WhatsApp messages found. Use a DD/MM/YYYY WhatsApp export.",
    );
  if (messages.length > 10000)
    throw new Error("Split chats into fewer than 10,000 messages per import.");
  return messages;
}
// Stream decompression; stop before a large archive can allocate an unbounded output.
export function readChatExport(
  bytes: Uint8Array,
  name: string,
): Promise<{ name: string; text: string }[]> {
  if (bytes.length > 10 * 1024 * 1024)
    return Promise.reject(new Error("Chat export limit is 10 MB."));
  if (/\.txt$/i.test(name))
    return Promise.resolve([{ name, text: strFromU8(bytes) }]);
  if (!/\.zip$/i.test(name))
    return Promise.reject(new Error("Choose a WhatsApp .txt or .zip export."));
  return new Promise((resolve, reject) => {
    const entries: { name: string; text: string }[] = [];
    let total = 0,
      count = 0,
      failed = false;
    const unzip = new Unzip((file) => {
      if (failed) return;
      if (
        file.originalSize !== undefined &&
        file.originalSize > 4 * 1024 * 1024 &&
        /\.txt$/i.test(file.name)
      ) {
        failed = true;
        reject(new Error("Extracted chat text exceeds 4 MB."));
        return;
      }
      if (++count > 200) {
        failed = true;
        reject(new Error("Archive contains too many entries."));
        return;
      }
      if (
        !/\.txt$/i.test(file.name) ||
        file.name.includes("..") ||
        file.name.startsWith("/")
      )
        return;
      const chunks: Uint8Array[] = [];
      file.ondata = (error, chunk, final) => {
        if (failed) return;
        if (error) {
          failed = true;
          reject(new Error("Invalid ZIP archive."));
          return;
        }
        total += chunk.length;
        if (total > 4 * 1024 * 1024) {
          failed = true;
          file.terminate();
          reject(new Error("Extracted chat text exceeds 4 MB."));
          return;
        }
        chunks.push(chunk);
        if (final) {
          const all = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
          let offset = 0;
          for (const c of chunks) {
            all.set(c, offset);
            offset += c.length;
          }
          entries.push({
            name: file.name.split("/").pop()!,
            text: strFromU8(all),
          });
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    try {
      for (let offset = 0; offset < bytes.length && !failed; offset += 1024)
        unzip.push(
          bytes.subarray(offset, offset + 1024),
          offset + 1024 >= bytes.length,
        );
      if (!failed) {
        if (!entries.length)
          reject(
            new Error("ZIP contains no .txt chats. Export without media."),
          );
        else resolve(entries);
      }
    } catch {
      reject(new Error("Unable to read ZIP."));
    }
  });
}
